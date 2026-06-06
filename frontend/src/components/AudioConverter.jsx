/**
 * AudioConverter.jsx — SERVER-SIDE VERSION
 * All conversion runs on the Render Express+FFmpeg backend.
 * No ffmpeg.wasm. No CDN imports. No SharedArrayBuffer issues.
 *
 * File uploads go DIRECTLY to VITE_CONVERTER_URL (bypasses Netlify 6MB limit).
 * Status polling goes through /api/convert/status/:id (Netlify proxy).
 * Downloads go DIRECTLY to VITE_CONVERTER_URL/jobs/:id/download.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const FORMATS = [
  { id: 'mp3',  label: 'MP3',  desc: 'Universal',     lossless: false },
  { id: 'm4a',  label: 'M4A',  desc: 'Apple devices',  lossless: false },
  { id: 'aac',  label: 'AAC',  desc: 'Compact',        lossless: false },
  { id: 'wav',  label: 'WAV',  desc: 'Lossless',       lossless: true  },
  { id: 'flac', label: 'FLAC', desc: 'Hi-Fi lossless', lossless: true  },
  { id: 'ogg',  label: 'OGG',  desc: 'Open source',    lossless: false },
];

const QUALITIES = [
  { value: '64',  label: '64',  desc: 'Smallest' },
  { value: '128', label: '128', desc: 'Standard' },
  { value: '192', label: '192', desc: 'Good'     },
  { value: '256', label: '256', desc: 'High'     },
  { value: '320', label: '320', desc: 'Best'     },
];

const ALLOWED_EXTS = /\.(mp4|mov|avi|webm|mkv|m4v|flv|mpeg|mp3|m4a|wav|ogg|flac)$/i;
const POLL_MS      = 2000;
const TIMEOUT_MS   = 10 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBytes(b) {
  if (!b) return '';
  return b < 1048576 ? `${(b/1024).toFixed(0)} KB` : `${(b/1048576).toFixed(1)} MB`;
}

function fmtEta(s) {
  if (!s || s <= 0) return '';
  return s < 60 ? `~${s}s left` : `~${Math.ceil(s/60)}m left`;
}

function estimateBytes(fileSize, format, kbps) {
  if (!fileSize || ['wav','flac'].includes(format)) return null;
  return Math.round(fileSize * (parseInt(kbps) / 1500));
}

function saveFile(url, filename) {
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'audio';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AudioConverter({ sourceUrl = null, sourceFilename = null }) {
  const [file,      setFile]      = useState(null);
  const [dragging,  setDragging]  = useState(false);
  const [format,    setFormat]    = useState('mp3');
  const [quality,   setQuality]   = useState('128');
  const [jobId,     setJobId]     = useState(null);
  const [jobState,  setJobState]  = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const inputRef                  = useRef(null);
  const pollRef                   = useRef(null);
  const startRef                  = useRef(null);

  const isDone    = jobState?.status === 'done';
  const isFailed  = jobState?.status === 'error';
  const isWorking = loading || (jobId && !isDone && !isFailed);
  const isLossless= FORMATS.find(f => f.id === format)?.lossless ?? false;
  const estimate  = file?.size ? estimateBytes(file.size, format, quality) : null;

  // ── Stop polling ──────────────────────────────────────────────────────────
  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  // ── Poll job status ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    startRef.current = Date.now();

    const tick = async () => {
      if (Date.now() - startRef.current > TIMEOUT_MS) {
        stopPoll();
        setJobState(p => ({ ...p, status: 'error', statusText: 'Timed out.' }));
        return;
      }
      try {
        const res  = await fetch(`/api/convert/status/${jobId}`);
        const data = await res.json();
        setJobState(data);
        if (data.status === 'done' || data.status === 'error') {
          stopPoll();
        } else {
          pollRef.current = setTimeout(tick, POLL_MS);
        }
      } catch {
        pollRef.current = setTimeout(tick, POLL_MS * 2);
      }
    };

    tick();
    return stopPoll;
  }, [jobId, stopPoll]);

  // ── File handling ─────────────────────────────────────────────────────────
  const resetJob = () => {
    stopPoll(); setJobId(null); setJobState(null); setError(null); setLoading(false);
  };

  const acceptFile = (f) => {
    if (!f) return;
    if (!ALLOWED_EXTS.test(f.name)) {
      setError('Unsupported file. Please select a video or audio file.');
      return;
    }
    resetJob(); setFile(f);
  };

  const handleDrop   = (e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); };
  const handleOver   = (e) => { e.preventDefault(); setDragging(true);  };
  const handleLeave  = ()  => setDragging(false);
  const handleChange = (e) => acceptFile(e.target.files?.[0]);

  // ── Start conversion ──────────────────────────────────────────────────────
  const startConversion = async () => {
    resetJob();
    setLoading(true);

    const converterUrl = import.meta.env.VITE_CONVERTER_URL;
    if (!converterUrl) {
      setError('Converter not configured. Add VITE_CONVERTER_URL to Netlify environment variables.');
      setLoading(false);
      return;
    }

    try {
      let jobData;

      if (file) {
        // ── File upload: goes DIRECT to Render (no Netlify size limit) ──
        const form = new FormData();
        form.append('file',     file);
        form.append('format',   format);
        form.append('quality',  quality);
        form.append('filename', file.name.replace(/\.[^.]+$/, ''));

        const res = await fetch(`${converterUrl}/jobs`, { method: 'POST', body: form });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Server error (${res.status})`);
        jobData = body;

      } else if (sourceUrl) {
        // ── URL conversion: goes through Netlify proxy ──
        const res = await fetch('/api/convert/job', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            url:      sourceUrl,
            format,
            quality,
            filename: sourceFilename || 'audio',
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || `Server error (${res.status})`);
        jobData = body;

      } else {
        throw new Error('No file selected and no source URL available.');
      }

      setJobId(jobData.jobId);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Download completed file ───────────────────────────────────────────────
  const handleDownload = () => {
    const converterUrl = import.meta.env.VITE_CONVERTER_URL;
    if (!jobState?.jobId || !converterUrl) return;
    saveFile(`${converterUrl}/jobs/${jobState.jobId}/download`, `audio.${format}`);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <section className="w-full max-w-xl flex flex-col gap-4" aria-label="Audio Converter">

      <div>
        <h2 className="text-white font-bold text-base">Video to Audio Converter</h2>
        <p className="text-zinc-500 text-xs mt-0.5">
          {sourceUrl
            ? 'Convert the downloaded video to audio, or upload a different file.'
            : 'Upload any video file to extract audio in your chosen format.'}
        </p>
      </div>

      {/* Source indicator */}
      {sourceUrl && !file && (
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5">
          <span className="text-green-400 text-sm">✓</span>
          <p className="text-zinc-300 text-xs truncate flex-1">{sourceFilename || 'Downloaded video'}</p>
          <span className="text-zinc-600 text-xs">from downloader</span>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop} onDragOver={handleOver} onDragLeave={handleLeave}
        onClick={() => !isWorking && inputRef.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !isWorking && inputRef.current?.click()}
        aria-label="Upload video file"
        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all
          ${dragging ? 'border-blue-400 bg-blue-950/20' : file ? 'border-zinc-600 bg-zinc-900' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'}
          ${isWorking ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}`}
      >
        <input ref={inputRef} type="file" accept="video/*,audio/*,.mp4,.mov,.avi,.webm,.mkv,.mp3,.m4a,.wav,.ogg,.flac"
          onChange={handleChange} className="hidden" />
        {file ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-left overflow-hidden">
              <p className="text-zinc-200 text-sm font-medium truncate">{file.name}</p>
              <p className="text-zinc-500 text-xs">{fmtBytes(file.size)}</p>
            </div>
            {!isWorking && (
              <button onClick={(e) => { e.stopPropagation(); setFile(null); resetJob(); }}
                className="text-zinc-600 hover:text-zinc-400" aria-label="Remove">✕</button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-zinc-400 text-sm font-medium">
              {dragging ? 'Drop video here' : 'Tap or drag a video file here'}
            </p>
            {sourceUrl && <p className="text-zinc-600 text-xs mt-1">Or use the downloaded video above</p>}
          </div>
        )}
      </div>

      {/* Format grid */}
      <div>
        <p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Output Format</p>
        <div className="grid grid-cols-3 gap-2">
          {FORMATS.map(f => (
            <button key={f.id} onClick={() => !isWorking && setFormat(f.id)} disabled={isWorking}
              aria-pressed={format === f.id}
              className={`flex flex-col items-center py-2.5 px-2 rounded-xl border text-center transition-all disabled:opacity-50
                ${format === f.id ? 'border-blue-500 bg-blue-950 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'}`}>
              <span className="font-bold text-sm">{f.label}</span>
              <span className="text-xs opacity-70 mt-0.5">{f.desc}</span>
              {f.lossless && <span className="text-xs text-green-400 mt-0.5">lossless</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Quality grid */}
      {!isLossless && (
        <div>
          <p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Audio Quality</p>
          <div className="grid grid-cols-5 gap-1.5">
            {QUALITIES.map(q => (
              <button key={q.value} onClick={() => !isWorking && setQuality(q.value)} disabled={isWorking}
                aria-pressed={quality === q.value}
                className={`flex flex-col items-center py-2 rounded-xl border text-center transition-all disabled:opacity-50 text-xs
                  ${quality === q.value ? 'border-blue-500 bg-blue-950 text-white' : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'}`}>
                <span className="font-semibold">{q.value}</span>
                <span className="opacity-60">kbps</span>
              </button>
            ))}
          </div>
          {estimate && (
            <p className="text-zinc-600 text-xs mt-2 text-right">Estimated output: ~{fmtBytes(estimate)}</p>
          )}
        </div>
      )}

      {/* Convert button */}
      {!isDone && (
        <button onClick={startConversion}
          disabled={isWorking || (!file && !sourceUrl)}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors">
          {loading ? 'Starting…' : isWorking ? 'Converting…' : `Convert to ${format.toUpperCase()}`}
        </button>
      )}

      {/* Progress */}
      {isWorking && jobState && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between">
            <span className="text-zinc-300 text-xs">{jobState.statusText || 'Processing…'}</span>
            <span className="text-zinc-500 text-xs">
              {jobState.progress > 0 ? `${jobState.progress}%` : ''}
              {jobState.eta ? `  ${fmtEta(jobState.eta)}` : ''}
            </span>
          </div>
          <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden"
            role="progressbar" aria-valuenow={jobState.progress || 0} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 bg-purple-500 rounded-full transition-all duration-500"
              style={{ width: `${jobState.progress || 0}%` }} />
          </div>
        </div>
      )}

      {/* Done */}
      {isDone && (
        <div className="flex flex-col gap-2">
          <button onClick={handleDownload}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors">
            Download {format.toUpperCase()}
            {jobState.fileSizeBytes ? ` (${fmtBytes(jobState.fileSizeBytes)})` : ''}
          </button>
          <button onClick={() => { resetJob(); setFile(null); }}
            className="text-zinc-500 hover:text-zinc-300 text-xs text-center py-1 transition-colors">
            Convert another file
          </button>
        </div>
      )}

      {/* Error */}
      {(error || isFailed) && (
        <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-red-400 flex-shrink-0 text-base">⚠</span>
          <div className="flex-1">
            <p className="text-red-300 text-xs">
              {error || jobState?.error || jobState?.statusText || 'Conversion failed.'}
            </p>
            <button onClick={() => { resetJob(); setError(null); }}
              className="text-red-400 hover:text-red-300 text-xs mt-1 underline">Try again</button>
          </div>
        </div>
      )}

    </section>
  );
}
