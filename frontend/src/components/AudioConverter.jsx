/**
 * AudioConverter.jsx
 * Full-featured server-side video-to-audio converter component.
 *
 * Two entry modes:
 *   1. sourceUrl prop — convert a video already downloaded by the downloader
 *   2. File upload (drag-drop or picker) — convert any local video file
 *
 * Sends conversion jobs to the Express converter service on Render via
 * Netlify function proxies. File downloads stream directly from Render
 * to bypass Netlify's 6 MB response limit.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { createConversionJob, getConversionStatus, getConverterDownloadUrl } from '../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMATS = [
  { id: 'mp3',  label: 'MP3',  desc: 'Universal',    lossless: false },
  { id: 'm4a',  label: 'M4A',  desc: 'Apple devices', lossless: false },
  { id: 'aac',  label: 'AAC',  desc: 'Compact',       lossless: false },
  { id: 'wav',  label: 'WAV',  desc: 'Lossless',      lossless: true  },
  { id: 'flac', label: 'FLAC', desc: 'Hi-Fi lossless', lossless: true  },
  { id: 'ogg',  label: 'OGG',  desc: 'Open source',   lossless: false },
];

const QUALITIES = [
  { value: '64',  label: '64 kbps',  desc: 'Smallest' },
  { value: '128', label: '128 kbps', desc: 'Standard' },
  { value: '192', label: '192 kbps', desc: 'Good'     },
  { value: '256', label: '256 kbps', desc: 'High'     },
  { value: '320', label: '320 kbps', desc: 'Best'     },
];

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_MS      = 10 * 60 * 1000; // 10 minute timeout

const ALLOWED_TYPES = new Set([
  'video/mp4','video/quicktime','video/x-msvideo','video/webm',
  'video/x-matroska','video/3gpp','video/x-flv','video/mpeg',
  'audio/mpeg','audio/mp4','audio/wav','audio/ogg','audio/flac',
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatEta(seconds) {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `~${seconds}s left`;
  return `~${Math.ceil(seconds / 60)}m left`;
}

function estimateOutputBytes(fileSizeBytes, format, qualityKbps) {
  if (!fileSizeBytes || ['wav', 'flac'].includes(format)) return null;
  // Rough estimate: ratio of target bitrate vs typical video bitrate (~1500 kbps)
  return Math.round(fileSizeBytes * (parseInt(qualityKbps) / 1500));
}

function triggerFileDownload(url, filename) {
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename || 'audio';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AudioConverter({ sourceUrl = null, sourceFilename = null }) {
  // Input state
  const [file,      setFile]      = useState(null);
  const [dragging,  setDragging]  = useState(false);
  const inputRef                  = useRef(null);

  // Conversion settings
  const [format,   setFormat]   = useState('mp3');
  const [quality,  setQuality]  = useState('128');

  // Job state
  const [jobId,    setJobId]    = useState(null);
  const [jobState, setJobState] = useState(null); // full status object
  const pollRef                 = useRef(null);
  const startedAt               = useRef(null);

  // UI state
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const isDone     = jobState?.status === 'done';
  const isFailed   = jobState?.status === 'error';
  const isWorking  = loading || (jobState && !isDone && !isFailed);
  const isLossless = FORMATS.find(f => f.id === format)?.lossless ?? false;

  const selectedFile = file || (sourceUrl ? { name: sourceFilename || 'video', size: null } : null);
  const sizeEstimate = selectedFile?.size
    ? estimateOutputBytes(selectedFile.size, format, quality)
    : null;

  // ── Polling ──────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      // Timeout guard
      if (startedAt.current && Date.now() - startedAt.current > MAX_POLL_MS) {
        stopPolling();
        setJobState(prev => ({
          ...prev,
          status:     'error',
          statusText: 'Timed out waiting for conversion.',
        }));
        return;
      }

      try {
        const data = await getConversionStatus(jobId);
        setJobState(data);
        if (data.status === 'done' || data.status === 'error') {
          stopPolling();
        } else {
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        // Network blip — keep polling
        pollRef.current = setTimeout(poll, POLL_INTERVAL_MS * 2);
      }
    };

    startedAt.current = Date.now();
    poll();
    return stopPolling;
  }, [jobId, stopPolling]);

  // ── File input ────────────────────────────────────────────────────────────

  const resetJob = () => {
    stopPolling();
    setJobId(null);
    setJobState(null);
    setError(null);
    setLoading(false);
  };

  const acceptFile = (f) => {
    if (!f) return;
    if (!ALLOWED_TYPES.has(f.type) && !f.name.match(/\.(mp4|mov|avi|webm|mkv|m4v|flv|mpeg|mp3|m4a|wav|ogg|flac)$/i)) {
      setError('Unsupported file type. Please select a video or audio file.');
      return;
    }
    resetJob();
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  };

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true);  };
  const handleDragLeave     = ()  => setDragging(false);
  const handleFileChange    = (e) => acceptFile(e.target.files?.[0]);

  // ── Start conversion ──────────────────────────────────────────────────────

  const startConversion = async () => {
    resetJob();
    setLoading(true);

    try {
      let jobData;

      if (file) {
        // File upload → send directly to converter (bypasses Netlify 6 MB limit)
        const form = new FormData();
        form.append('file', file);
        form.append('format', format);
        form.append('quality', quality);
        form.append('filename', file.name.replace(/\.[^.]+$/, ''));

        const converterUrl = import.meta.env.VITE_CONVERTER_URL;
        if (!converterUrl) throw new Error('Converter URL not configured. Set VITE_CONVERTER_URL on Netlify.');

        const res = await fetch(`${converterUrl}/jobs`, { method: 'POST', body: form });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Upload failed (${res.status})`);
        }
        jobData = await res.json();
      } else if (sourceUrl) {
        // URL-based → proxy through Netlify function
        jobData = await createConversionJob({
          url:      sourceUrl,
          format,
          quality,
          filename: sourceFilename || 'audio',
        });
      } else {
        throw new Error('No file selected and no source URL provided.');
      }

      setJobId(jobData.jobId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!jobState?.jobId) return;
    const url = getConverterDownloadUrl(jobState.jobId);
    triggerFileDownload(url, `audio.${format}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section
      className="w-full max-w-xl flex flex-col gap-4"
      aria-label="Video to Audio Converter"
    >
      {/* ── Header ── */}
      <div>
        <h2 className="text-white font-bold text-base">Video to Audio Converter</h2>
        <p className="text-zinc-500 text-xs mt-0.5">
          {sourceUrl
            ? 'Convert the downloaded video to audio, or upload a different file below.'
            : 'Upload any video file to extract audio in your chosen format.'}
        </p>
      </div>

      {/* ── Source indicator (when coming from downloader) ── */}
      {sourceUrl && !file && (
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5">
          <span className="text-green-400 text-sm">✓</span>
          <p className="text-zinc-300 text-xs truncate flex-1">
            {sourceFilename || 'Downloaded video'}
          </p>
          <span className="text-zinc-600 text-xs">from downloader</span>
        </div>
      )}

      {/* ── Drop zone / File picker ── */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isWorking && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !isWorking && inputRef.current?.click()}
        aria-label="Upload video file for conversion"
        className={`
          border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
          ${dragging
            ? 'border-blue-400 bg-blue-950/30'
            : file
              ? 'border-zinc-600 bg-zinc-900'
              : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'
          }
          ${isWorking ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*,.mp4,.mov,.avi,.webm,.mkv,.m4v,.flv,.mp3,.m4a,.wav,.ogg,.flac"
          onChange={handleFileChange}
          className="hidden"
          aria-hidden="true"
        />
        {file ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-left overflow-hidden">
              <p className="text-zinc-200 text-sm font-medium truncate">{file.name}</p>
              {file.size && (
                <p className="text-zinc-500 text-xs">{formatBytes(file.size)}</p>
              )}
            </div>
            {!isWorking && (
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); resetJob(); }}
                className="text-zinc-600 hover:text-zinc-400 text-lg flex-shrink-0"
                aria-label="Remove selected file"
              >
                ✕
              </button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-zinc-400 text-sm font-medium">
              {dragging ? 'Drop video here' : 'Tap or drag a video file here'}
            </p>
            {sourceUrl && (
              <p className="text-zinc-600 text-xs mt-1">Or use the downloaded video above</p>
            )}
          </div>
        )}
      </div>

      {/* ── Format selector ── */}
      <div>
        <p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">
          Output Format
        </p>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map(f => (
            <button
              key={f.id}
              onClick={() => !isWorking && setFormat(f.id)}
              disabled={isWorking}
              aria-pressed={format === f.id}
              className={`
                flex flex-col items-center py-2.5 px-2 rounded-xl border text-center
                transition-all disabled:opacity-50 disabled:cursor-not-allowed
                ${format === f.id
                  ? 'border-blue-500 bg-blue-950 text-white'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                }
              `}
            >
              <span className="font-bold text-sm">{f.label}</span>
              <span className="text-xs opacity-70 mt-0.5">{f.desc}</span>
              {f.lossless && (
                <span className="text-xs text-green-400 mt-0.5">lossless</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Quality selector (hidden for lossless) ── */}
      {!isLossless && (
        <div>
          <p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">
            Audio Quality
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {QUALITIES.map(q => (
              <button
                key={q.value}
                onClick={() => !isWorking && setQuality(q.value)}
                disabled={isWorking}
                aria-pressed={quality === q.value}
                className={`
                  flex flex-col items-center py-2 rounded-xl border text-center
                  transition-all disabled:opacity-50 disabled:cursor-not-allowed text-xs
                  ${quality === q.value
                    ? 'border-blue-500 bg-blue-950 text-white'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                  }
                `}
              >
                <span className="font-semibold">{q.value}</span>
                <span className="opacity-60">kbps</span>
              </button>
            ))}
          </div>

          {/* File size estimate */}
          {sizeEstimate && (
            <p className="text-zinc-600 text-xs mt-2 text-right">
              Estimated output: ~{formatBytes(sizeEstimate)}
            </p>
          )}
        </div>
      )}

      {/* ── Convert button ── */}
      {!isDone && (
        <button
          onClick={startConversion}
          disabled={isWorking || (!file && !sourceUrl)}
          className="
            w-full bg-purple-600 hover:bg-purple-500
            disabled:opacity-40 disabled:cursor-not-allowed
            text-white font-semibold py-3 rounded-xl transition-colors
          "
        >
          {loading
            ? 'Starting…'
            : isWorking
              ? 'Converting…'
              : `Convert to ${format.toUpperCase()}`}
        </button>
      )}

      {/* ── Progress ── */}
      {isWorking && jobState && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <span className="text-zinc-300 text-xs">{jobState.statusText || 'Processing…'}</span>
            <span className="text-zinc-500 text-xs">
              {jobState.progress > 0 ? `${jobState.progress}%` : ''}
              {jobState.eta ? `  ${formatEta(jobState.eta)}` : ''}
            </span>
          </div>
          <div
            className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden"
            role="progressbar"
            aria-valuenow={jobState.progress || 0}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-2 bg-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${jobState.progress || 0}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {isDone && (
        <div className="flex flex-col gap-2">
          <button
            onClick={handleDownload}
            className="
              w-full bg-green-600 hover:bg-green-500
              text-white font-semibold py-3 rounded-xl transition-colors
            "
          >
            Download {format.toUpperCase()}
            {jobState.fileSizeBytes
              ? ` (${formatBytes(jobState.fileSizeBytes)})`
              : ''}
          </button>
          <button
            onClick={() => { resetJob(); }}
            className="text-zinc-500 hover:text-zinc-300 text-xs text-center py-1 transition-colors"
          >
            Convert another file
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {(error || isFailed) && (
        <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-red-400 text-base flex-shrink-0">⚠</span>
          <div className="flex-1">
            <p className="text-red-300 text-xs">
              {error || jobState?.statusText || 'Conversion failed.'}
            </p>
            <button
              onClick={() => { resetJob(); setError(null); }}
              className="text-red-400 hover:text-red-300 text-xs mt-1 underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
