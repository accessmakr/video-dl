/**
 * VidVert — AudioConverter.jsx
 * Server-side audio extraction. All conversion runs on Render FFmpeg service.
 *
 * Props:
 *   sourceUrl      — Cobalt stream URL from downloader tab (optional)
 *   sourceFilename — display name for the source video (optional)
 *
 * Two input modes:
 *   1. File upload (drag-drop or picker) → XHR with upload % → conversion %
 *   2. URL from downloader               → JSON POST → conversion %
 *
 * Advanced settings: trim, volume, fade in/out, reverse, codec mode
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  uploadFileForConversion,
  uploadFileAdvanced,
  createConversionJob,
  getConversionStatus,
  getConverterDownloadUrl,
} from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const FORMATS = [
  { id: 'mp3',  label: 'MP3',  desc: 'Universal',      lossless: false },
  { id: 'm4a',  label: 'M4A',  desc: 'Apple/iTunes',   lossless: false },
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

// All video + audio file extensions accepted as input
const ACCEPT = [
  'video/*','audio/*',
  '.mp4','.mov','.avi','.webm','.mkv','.m4v','.flv','.wmv','.mpeg','.mpg',
  '.3gp','.3gpp','.ts','.m2ts','.mts','.rm','.rmvb','.ogv','.divx','.vob',
  '.mp3','.m4a','.aac','.wav','.flac','.ogg','.wma','.opus','.aiff',
].join(',');

const ALLOWED_EXTS = /\.(mp4|mov|avi|webm|mkv|m4v|flv|wmv|mpeg|mpg|3gp|3gpp|ts|m2ts|mts|rm|rmvb|ogv|divx|vob|mp3|m4a|aac|wav|flac|ogg|wma|opus|aiff)$/i;

const POLL_MS    = 2000;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b) {
  if (!b) return '';
  return b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;
}

function fmtEta(s) {
  if (!s || s <= 0) return '';
  return s < 60 ? `~${s}s left` : `~${Math.ceil(s / 60)}m left`;
}

function estimateBytes(fileSize, format, kbps) {
  if (!fileSize || ['wav', 'flac'].includes(format)) return null;
  return Math.round(fileSize * (parseInt(kbps) / 1500));
}

function triggerDownload(url, filename) {
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename || 'audio';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const DEFAULT_ADVANCED = {
  trimStart: '',
  trimEnd:   '',
  volume:    100,
  fadeIn:    0,
  fadeOut:   0,
  reverse:   false,
  codecMode: 'auto',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AudioConverter({ sourceUrl = null, sourceFilename = null }) {
  // Input
  const [file,         setFile]         = useState(null);
  const [dragging,     setDragging]     = useState(false);
  const inputRef                        = useRef(null);

  // Settings
  const [format,       setFormat]       = useState('mp3');
  const [quality,      setQuality]      = useState('128');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advanced,     setAdvanced]     = useState(DEFAULT_ADVANCED);

  // Job state
  const [phase,        setPhase]        = useState('idle'); // idle|uploading|converting|done|error
  const [uploadPct,    setUploadPct]    = useState(0);
  const [jobId,        setJobId]        = useState(null);
  const [jobState,     setJobState]     = useState(null);
  const [error,        setError]        = useState(null);

  const pollRef  = useRef(null);
  const startRef = useRef(null);

  const isDone    = phase === 'done';
  const isFailed  = phase === 'error';
  const isWorking = phase === 'uploading' || phase === 'converting';
  const isLossless= FORMATS.find(f => f.id === format)?.lossless ?? false;
  const hasAdvanced = advanced.trimStart || advanced.trimEnd ||
    advanced.volume !== 100 || advanced.fadeIn || advanced.fadeOut ||
    advanced.reverse || advanced.codecMode !== 'auto';
  const estimate  = file?.size ? estimateBytes(file.size, format, quality) : null;

  // ── Polling ────────────────────────────────────────────────────────────────

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => {
    if (!jobId || phase !== 'converting') return;
    startRef.current = Date.now();

    const tick = async () => {
      if (Date.now() - startRef.current > TIMEOUT_MS) {
        stopPoll();
        setPhase('error');
        setError('Conversion timed out. Please try a shorter file.');
        return;
      }
      try {
        const data = await getConversionStatus(jobId);
        setJobState(data);
        if (data.status === 'done') {
          stopPoll(); setPhase('done');
        } else if (data.status === 'error') {
          stopPoll(); setPhase('error');
          setError(data.error || data.statusText || 'Conversion failed on the server.');
        } else {
          pollRef.current = setTimeout(tick, POLL_MS);
        }
      } catch {
        pollRef.current = setTimeout(tick, POLL_MS * 2);
      }
    };

    tick();
    return stopPoll;
  }, [jobId, phase, stopPoll]);

  // ── File handling ──────────────────────────────────────────────────────────

  const resetJob = () => {
    stopPoll();
    setJobId(null); setJobState(null);
    setError(null);  setPhase('idle');
    setUploadPct(0);
  };

  const acceptFile = (f) => {
    if (!f) return;
    if (!ALLOWED_EXTS.test(f.name)) {
      setError('Unsupported file type. Please select a video or audio file.');
      return;
    }
    resetJob();
    setFile(f);
  };

  const handleDrop   = (e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); };
  const handleOver   = (e) => { e.preventDefault(); setDragging(true);  };
  const handleLeave  = ()  => setDragging(false);
  const handleChange = (e) => acceptFile(e.target.files?.[0]);

  // ── Start conversion ───────────────────────────────────────────────────────

  const startConversion = async () => {
    resetJob();

    try {
      let jobData;
      const useAdvanced = hasAdvanced;

      if (file) {
        // File upload path — XHR for upload progress
        setPhase('uploading');
        setUploadPct(0);

        const form = new FormData();
        form.append('file',     file);
        form.append('format',   format);
        form.append('quality',  quality);
        form.append('filename', file.name.replace(/\.[^.]+$/, ''));

        if (useAdvanced) {
          if (advanced.trimStart)            form.append('trimStart',  advanced.trimStart);
          if (advanced.trimEnd)              form.append('trimEnd',    advanced.trimEnd);
          if (advanced.volume !== 100)       form.append('volume',     advanced.volume);
          if (advanced.fadeIn  > 0)          form.append('fadeIn',     advanced.fadeIn);
          if (advanced.fadeOut > 0)          form.append('fadeOut',    advanced.fadeOut);
          if (advanced.reverse)              form.append('reverse',    'true');
          if (advanced.codecMode !== 'auto') form.append('codecMode',  advanced.codecMode);

          jobData = await uploadFileAdvanced(form, (pct) => setUploadPct(pct));
        } else {
          jobData = await uploadFileForConversion(form, (pct) => setUploadPct(pct));
        }

      } else if (sourceUrl) {
        // URL from downloader — JSON post via Netlify proxy
        setPhase('converting');
        const payload = { url: sourceUrl, format, quality, filename: sourceFilename || 'audio' };
        if (useAdvanced) Object.assign(payload, advanced);
        jobData = await createConversionJob(payload);

      } else {
        throw new Error('No file selected and no source URL available.');
      }

      setJobId(jobData.jobId);
      setPhase('converting');

    } catch (e) {
      setPhase('error');
      setError(e.message);
    }
  };

  const handleDownload = () => {
    if (!jobState?.jobId) return;
    const url = getConverterDownloadUrl(jobState.jobId);
    triggerDownload(url, `audio.${format}`);
  };

  // ── Advance settings setter ────────────────────────────────────────────────
  const setAdv = (key, val) => setAdvanced(prev => ({ ...prev, [key]: val }));

  // ── Status label ───────────────────────────────────────────────────────────
  const statusLabel =
    phase === 'uploading'  ? `Uploading… ${uploadPct}%` :
    phase === 'converting' ? (jobState?.statusText || 'Converting…') : '';

  const progressValue =
    phase === 'uploading'  ? uploadPct :
    phase === 'converting' ? (jobState?.progress || 0) : 0;

  const progressColor =
    phase === 'uploading' ? 'bg-blue-500' : 'bg-purple-500';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="w-full max-w-xl flex flex-col gap-4" aria-label="Video to Audio Converter">

      <div>
        <h2 className="text-white font-bold text-base">Video to Audio Converter</h2>
        <p className="text-zinc-500 text-xs mt-0.5">
          {sourceUrl
            ? 'Convert the downloaded video to audio, or upload a different file.'
            : 'Upload any video or audio file to convert.'}
        </p>
      </div>

      {/* Source from downloader */}
      {sourceUrl && !file && (
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5">
          <span className="text-green-400 text-sm flex-shrink-0">✓</span>
          <p className="text-zinc-300 text-xs truncate flex-1">{sourceFilename || 'Downloaded video'}</p>
          <span className="text-zinc-600 text-xs flex-shrink-0">from downloader</span>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDrop={handleDrop} onDragOver={handleOver} onDragLeave={handleLeave}
        onClick={() => !isWorking && inputRef.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !isWorking && inputRef.current?.click()}
        aria-label="Upload file for audio conversion"
        className={`
          border-2 border-dashed rounded-xl p-5 text-center transition-all
          ${dragging ? 'border-blue-400 bg-blue-950/20' :
            file     ? 'border-zinc-600 bg-zinc-900' :
                       'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'}
          ${isWorking ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'}
        `}
      >
        <input ref={inputRef} type="file" accept={ACCEPT} onChange={handleChange} className="hidden" />
        {file ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-left overflow-hidden">
              <p className="text-zinc-200 text-sm font-medium truncate">{file.name}</p>
              <p className="text-zinc-500 text-xs">{fmtBytes(file.size)}</p>
            </div>
            {!isWorking && (
              <button
                onClick={(e) => { e.stopPropagation(); setFile(null); resetJob(); }}
                className="text-zinc-600 hover:text-zinc-400 flex-shrink-0"
                aria-label="Remove file"
              >✕</button>
            )}
          </div>
        ) : (
          <div>
            <p className="text-zinc-400 text-sm font-medium">
              {dragging ? 'Drop file here' : 'Tap or drag a video or audio file here'}
            </p>
            {sourceUrl && (
              <p className="text-zinc-600 text-xs mt-1">Or use the downloaded video above</p>
            )}
          </div>
        )}
      </div>

      {/* Format grid */}
      <div>
        <p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Output Format</p>
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
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'}
              `}
            >
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
          <p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Bitrate</p>
          <div className="grid grid-cols-5 gap-1.5">
            {QUALITIES.map(q => (
              <button
                key={q.value}
                onClick={() => !isWorking && setQuality(q.value)}
                disabled={isWorking}
                aria-pressed={quality === q.value}
                className={`
                  flex flex-col items-center py-2 rounded-xl border text-xs
                  transition-all disabled:opacity-50 disabled:cursor-not-allowed
                  ${quality === q.value
                    ? 'border-blue-500 bg-blue-950 text-white'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'}
                `}
              >
                <span className="font-semibold">{q.value}</span>
                <span className="opacity-60">kbps</span>
              </button>
            ))}
          </div>
          {estimate && (
            <p className="text-zinc-600 text-xs mt-2 text-right">
              Estimated output: ~{fmtBytes(estimate)}
            </p>
          )}
        </div>
      )}

      {/* Advanced settings toggle */}
      <button
        onClick={() => setShowAdvanced(v => !v)}
        disabled={isWorking}
        className="flex items-center justify-between w-full text-zinc-500 hover:text-zinc-300 text-xs py-1 transition-colors disabled:opacity-40"
      >
        <span className="font-medium">
          ⚙ Advanced settings
          {hasAdvanced && <span className="ml-2 text-blue-400">• active</span>}
        </span>
        <span>{showAdvanced ? '▲' : '▼'}</span>
      </button>

      {/* Advanced settings panel */}
      {showAdvanced && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-4">

          {/* Trim */}
          <div>
            <p className="text-zinc-400 text-xs font-medium mb-2">Trim (HH:MM:SS)</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-zinc-600 text-xs">Start</label>
                <input
                  type="text" placeholder="00:00:00"
                  value={advanced.trimStart}
                  onChange={(e) => setAdv('trimStart', e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs outline-none placeholder-zinc-600 font-mono"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-zinc-600 text-xs">End</label>
                <input
                  type="text" placeholder="00:00:00"
                  value={advanced.trimEnd}
                  onChange={(e) => setAdv('trimEnd', e.target.value)}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs outline-none placeholder-zinc-600 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Volume */}
          <div>
            <div className="flex justify-between mb-1">
              <label className="text-zinc-400 text-xs font-medium">Volume</label>
              <span className="text-zinc-300 text-xs font-mono">{advanced.volume}%</span>
            </div>
            <input
              type="range" min="0" max="200" step="5"
              value={advanced.volume}
              onChange={(e) => setAdv('volume', parseInt(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-zinc-600 text-xs mt-0.5">
              <span>0% (silence)</span><span>100% (original)</span><span>200% (double)</span>
            </div>
          </div>

          {/* Fade in / Fade out */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-zinc-400 text-xs font-medium">Fade In (seconds)</label>
              <input
                type="number" min="0" max="30" step="0.5" placeholder="0"
                value={advanced.fadeIn || ''}
                onChange={(e) => setAdv('fadeIn', parseFloat(e.target.value) || 0)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-zinc-400 text-xs font-medium">Fade Out (seconds)</label>
              <input
                type="number" min="0" max="30" step="0.5" placeholder="0"
                value={advanced.fadeOut || ''}
                onChange={(e) => setAdv('fadeOut', parseFloat(e.target.value) || 0)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs outline-none"
              />
            </div>
          </div>

          {/* Reverse + Codec */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={advanced.reverse}
                onChange={(e) => setAdv('reverse', e.target.checked)}
                className="accent-purple-500 w-4 h-4"
              />
              <span className="text-zinc-300 text-xs">Reverse audio</span>
            </label>
            <div className="flex flex-col gap-1">
              <label className="text-zinc-400 text-xs font-medium">Codec</label>
              <select
                value={advanced.codecMode}
                onChange={(e) => setAdv('codecMode', e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-xs outline-none"
              >
                <option value="auto">Auto (re-encode)</option>
                <option value="copy">Copy (fast, lossless)</option>
              </select>
            </div>
          </div>

          {/* Reset advanced */}
          <button
            onClick={() => setAdvanced(DEFAULT_ADVANCED)}
            className="text-zinc-600 hover:text-zinc-400 text-xs text-left transition-colors"
          >
            Reset to defaults
          </button>
        </div>
      )}

      {/* Convert button */}
      {!isDone && (
        <button
          onClick={startConversion}
          disabled={isWorking || (!file && !sourceUrl)}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {isWorking
            ? (phase === 'uploading' ? `Uploading… ${uploadPct}%` : (jobState?.statusText || 'Converting…'))
            : `Convert to ${format.toUpperCase()}`}
        </button>
      )}

      {/* Two-phase progress */}
      {isWorking && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center">
            <span className="text-zinc-300 text-xs">{statusLabel}</span>
            <span className="text-zinc-500 text-xs">
              {progressValue > 0 ? `${progressValue}%` : ''}
              {phase === 'converting' && jobState?.eta ? `  ${fmtEta(jobState.eta)}` : ''}
            </span>
          </div>
          <div
            className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden"
            role="progressbar"
            aria-valuenow={progressValue}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-2 ${progressColor} rounded-full transition-all duration-500`}
              style={{ width: `${progressValue}%` }}
            />
          </div>
          {phase === 'uploading' && (
            <p className="text-zinc-600 text-xs">Sending file to conversion server…</p>
          )}
        </div>
      )}

      {/* Done */}
      {isDone && (
        <div className="flex flex-col gap-2">
          <button
            onClick={handleDownload}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            ✓ Download {format.toUpperCase()}
            {jobState?.fileSizeBytes ? ` (${fmtBytes(jobState.fileSizeBytes)})` : ''}
          </button>
          <button
            onClick={() => { resetJob(); setFile(null); }}
            className="text-zinc-500 hover:text-zinc-300 text-xs text-center py-1 transition-colors"
          >
            Convert another file
          </button>
        </div>
      )}

      {/* Error */}
      {isFailed && (
        <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-red-400 flex-shrink-0 mt-0.5">⚠</span>
          <div className="flex-1">
            <p className="text-red-300 text-xs">{error || 'Conversion failed.'}</p>
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
