/**
 * services/api.js
 * All API calls for both the video downloader (Cobalt) and
 * the audio converter (Express/FFmpeg on Render).
 */

// ─── Cobalt downloader ────────────────────────────────────────────────────────

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

// ─── Audio converter ──────────────────────────────────────────────────────────

/**
 * Create a conversion job for a remote video URL.
 * Proxied through Netlify function to keep CONVERTER_URL secret.
 */
export async function createConversionJob({ url, format, quality, filename }) {
  const res = await fetch('/api/convert/job', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ url, format, quality, filename }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Job creation failed (${res.status})`);
  return data;
}

/**
 * Poll job status.
 * Proxied through Netlify function.
 */
export async function getConversionStatus(jobId) {
  const res = await fetch(`/api/convert/status/${jobId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Status fetch failed');
  return data;
}

/**
 * Build the direct download URL for a completed conversion job.
 * Goes directly to Render to avoid Netlify's 6 MB response size limit.
 * VITE_CONVERTER_URL is the public Render service URL.
 */
export function getConverterDownloadUrl(jobId) {
  const base = import.meta.env.VITE_CONVERTER_URL ?? '';
  return `${base}/jobs/${jobId}/download`;
}
