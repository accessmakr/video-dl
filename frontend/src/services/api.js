/**
 * VidVert — frontend/src/services/api.js
 *
 * Cobalt (video downloads): getPreview, getDownloadLink
 * Converter (audio/video tools): createConversionJob, getConversionStatus,
 *   getConverterDownloadUrl, uploadFileForConversion, uploadVideoForProcessing,
 *   uploadImageForWatermark
 */

const CONVERTER_URL = import.meta.env.VITE_CONVERTER_URL ?? '';

// ── Cobalt downloader ─────────────────────────────────────────────────────────

export async function getPreview(url) {
  try {
    const res = await fetch('/api/preview', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url }),
    });
    if (!res.ok) return { thumbnail: null, title: null };
    return res.json();
  } catch {
    return { thumbnail: null, title: null };
  }
}

export async function getDownloadLink(url, videoQuality) {
  const res = await fetch('/api/cobalt', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      url,
      videoQuality,
      downloadMode:  'auto',
      filenameStyle: 'pretty',
    }),
  });

  const data = await res.json();
  if (!res.ok || data.status === 'error') {
    throw new Error(data.error?.code ?? 'Unknown error');
  }
  return data;
}

// ── Audio / video converter (Express + FFmpeg on Render) ──────────────────────

/**
 * Create a conversion job for a remote video URL.
 * Proxied through Netlify convert-job.js.
 * Returns { jobId, status }
 */
export async function createConversionJob({ url, format, quality, filename, advanced = {} }) {
  const res = await fetch('/api/convert/job', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url, format, quality, filename, ...advanced }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Job creation failed (${res.status})`);
  return data;
}

/**
 * Poll converter job status via Netlify proxy.
 * Returns { jobId, status, statusText, progress, eta, fileSizeBytes, error }
 */
export async function getConversionStatus(jobId) {
  const res  = await fetch(`/api/convert/status/${jobId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Status fetch failed');
  return data;
}

/**
 * Direct download URL from Render converter service.
 * Bypasses Netlify 6 MB response limit.
 */
export function getConverterDownloadUrl(jobId) {
  return `${CONVERTER_URL}/jobs/${jobId}/download`;
}

// ── XHR uploads (file-based conversion — needed for upload progress events) ───

/**
 * Upload a video/audio file for audio extraction.
 * Uses XHR so upload progress percentage is available.
 * FormData must contain: file, format, quality, filename
 * Returns Promise<{ jobId, status }>
 */
export function uploadFileForConversion(formData, onUploadProgress) {
  if (!CONVERTER_URL) {
    return Promise.reject(new Error('Converter not configured. Set VITE_CONVERTER_URL on Netlify.'));
  }
  return _xhrUpload(`${CONVERTER_URL}/jobs`, formData, onUploadProgress);
}

/**
 * Upload a video/audio file with advanced settings (trim/volume/fade/reverse).
 * FormData must contain: file, format, quality, filename, plus any advanced params.
 */
export function uploadFileAdvanced(formData, onUploadProgress) {
  if (!CONVERTER_URL) {
    return Promise.reject(new Error('Converter not configured. Set VITE_CONVERTER_URL on Netlify.'));
  }
  return _xhrUpload(`${CONVERTER_URL}/jobs/advanced`, formData, onUploadProgress);
}

/**
 * Upload a video file for format conversion, compression, trimming, or GIF.
 * endpoint: 'convert-video' | 'compress-video' | 'trim-video' | 'convert-gif'
 * FormData must contain: file, plus endpoint-specific params.
 */
export function uploadVideoForProcessing(endpoint, formData, onUploadProgress) {
  if (!CONVERTER_URL) {
    return Promise.reject(new Error('Converter not configured. Set VITE_CONVERTER_URL on Netlify.'));
  }
  return _xhrUpload(`${CONVERTER_URL}/${endpoint}`, formData, onUploadProgress);
}

/**
 * Upload an image or video file for watermark removal.
 * imageEndpoint: 'watermark-image' | 'watermark'
 */
export function uploadForWatermarkRemoval(imageEndpoint, formData, onUploadProgress) {
  if (!CONVERTER_URL) {
    return Promise.reject(new Error('Converter not configured. Set VITE_CONVERTER_URL on Netlify.'));
  }
  return _xhrUpload(`${CONVERTER_URL}/${imageEndpoint}`, formData, onUploadProgress);
}

// ── Internal XHR helper ───────────────────────────────────────────────────────

function _xhrUpload(url, formData, onUploadProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onUploadProgress(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `Server error (${xhr.status})`));
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };

    xhr.onerror   = () => reject(new Error('Network error — check your connection and try again'));
    xhr.ontimeout = () => reject(new Error('Upload timed out — file may be too large for your connection'));
    xhr.timeout   = 5 * 60 * 1000; // 5 minutes

    xhr.open('POST', url);
    xhr.send(formData);
  });
}
