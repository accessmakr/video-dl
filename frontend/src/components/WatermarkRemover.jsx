/**
 * WatermarkRemover.jsx
 * Sends video to the converter backend which applies FFmpeg delogo filter.
 * Removes watermarks from specified regions — preset or custom coordinates.
 */

import { useState, useRef } from 'react';

const PRESETS = [
  { id: 'tiktok-bottom', label: 'TikTok (bottom)',      x: 0,  y: 75, w: 100, h: 25, desc: 'Removes TikTok username + logo watermark' },
  { id: 'top-left',      label: 'Top Left',             x: 0,  y: 0,  w: 25,  h: 15, desc: 'Top-left corner logo or text' },
  { id: 'top-right',     label: 'Top Right',            x: 75, y: 0,  w: 25,  h: 15, desc: 'Top-right corner logo or text' },
  { id: 'bottom-left',   label: 'Bottom Left',          x: 0,  y: 80, w: 35,  h: 20, desc: 'Bottom-left watermark or username' },
  { id: 'bottom-right',  label: 'Bottom Right',         x: 65, y: 80, w: 35,  h: 20, desc: 'Bottom-right corner logo' },
  { id: 'custom',        label: 'Custom Position',      x: 0,  y: 0,  w: 0,   h: 0,  desc: 'Specify exact pixel coordinates' },
];

const ALLOWED_TYPES = new Set([
  'video/mp4','video/quicktime','video/x-msvideo','video/webm','video/x-matroska',
]);

function formatBytes(b) {
  if (!b) return '';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function WatermarkRemover() {
  const [file,       setFile]      = useState(null);
  const [preset,     setPreset]    = useState('tiktok-bottom');
  const [custom,     setCustom]    = useState({ x: 0, y: 0, w: 200, h: 60 });
  const [statusMsg,  setStatusMsg] = useState('');
  const [progress,   setProgress]  = useState(0);
  const [converting, setConverting]= useState(false);
  const [resultUrl,  setResultUrl] = useState(null);
  const [resultName, setResultName]= useState('');
  const [error,      setError]     = useState(null);
  const [dragging,   setDragging]  = useState(false);
  const inputRef = useRef(null);

  const selectedPreset = PRESETS.find(p => p.id === preset);
  const isCustom = preset === 'custom';

  const reset = () => {
    setResultUrl(null); setError(null); setStatusMsg(''); setProgress(0);
  };

  const acceptFile = (f) => {
    if (!f) return;
    if (!ALLOWED_TYPES.has(f.type) && !f.name.match(/\.(mp4|mov|avi|webm|mkv)$/i)) {
      setError('Please select a video file (MP4, MOV, AVI, WebM, MKV).');
      return;
    }
    setFile(f); reset();
    setResultName(f.name.replace(/\.[^.]+$/, '') + '_no_watermark.mp4');
  };

  const handleDrop  = (e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); };
  const handleOver  = (e) => { e.preventDefault(); setDragging(true);  };
  const handleLeave = ()  => setDragging(false);
  const handleChange= (e) => acceptFile(e.target.files?.[0]);

  const handleRemove = async () => {
    if (!file) return;
    setConverting(true); setError(null); setResultUrl(null); setProgress(0);

    const converterUrl = import.meta.env.VITE_CONVERTER_URL;
    if (!converterUrl) {
      setError('Converter service not yet deployed. Follow the deployment guide.');
      setConverting(false); return;
    }

    try {
      // Build region params — presets use percentages, custom uses pixels
      const form = new FormData();
      form.append('file', file);
      form.append('filename', file.name.replace(/\.[^.]+$/, ''));

      if (isCustom) {
        form.append('x', custom.x);
        form.append('y', custom.y);
        form.append('w', custom.w);
        form.append('h', custom.h);
        form.append('mode', 'pixels');
      } else {
        form.append('x', selectedPreset.x);
        form.append('y', selectedPreset.y);
        form.append('w', selectedPreset.w);
        form.append('h', selectedPreset.h);
        form.append('mode', 'percent');
      }

      setStatusMsg('Uploading video…');
      const createRes = await fetch(`${converterUrl}/watermark`, { method: 'POST', body: form });
      if (!createRes.ok) {
        const e = await createRes.json().catch(() => ({}));
        throw new Error(e.error || `Upload failed (${createRes.status})`);
      }
      const { jobId } = await createRes.json();

      // Poll status
      setStatusMsg('Removing watermark…');
      const startedAt = Date.now();
      while (true) {
        if (Date.now() - startedAt > 10 * 60 * 1000) throw new Error('Timed out.');
        await new Promise(r => setTimeout(r, 1500));
        const statusRes = await fetch(`${converterUrl}/jobs/${jobId}`);
        const job = await statusRes.json();
        setProgress(job.progress ?? 0);
        if (job.status === 'done')  { setResultUrl(`${converterUrl}/jobs/${jobId}/download`); setProgress(100); break; }
        if (job.status === 'error') throw new Error(job.error || 'Removal failed.');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setConverting(false); setStatusMsg('');
    }
  };

  const saveVideo = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl; a.download = resultName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <section className="w-full max-w-xl flex flex-col gap-4" aria-label="Watermark Remover">
      <div>
        <h2 className="text-white font-bold text-base flex items-center gap-2">
          <span aria-hidden="true">🚫</span> Watermark Remover
        </h2>
        <p className="text-zinc-500 text-xs mt-0.5">
          Upload a video, choose the watermark position, and download the clean version.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop} onDragOver={handleOver} onDragLeave={handleLeave}
        onClick={() => !converting && inputRef.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && !converting && inputRef.current?.click()}
        aria-label="Upload video for watermark removal"
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
          ${dragging ? 'border-orange-400 bg-orange-950/20' : file ? 'border-zinc-600 bg-zinc-900' : 'border-zinc-700 hover:border-zinc-500 bg-zinc-900/50'}
          ${converting ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`}
      >
        <input ref={inputRef} type="file" accept="video/*,.mp4,.mov,.avi,.webm,.mkv" onChange={handleChange} className="hidden" />
        {file ? (
          <div className="flex items-center justify-between gap-3">
            <div className="text-left overflow-hidden">
              <p className="text-zinc-200 text-sm font-medium truncate">{file.name}</p>
              <p className="text-zinc-500 text-xs">{formatBytes(file.size)}</p>
            </div>
            {!converting && (
              <button onClick={(e) => { e.stopPropagation(); setFile(null); reset(); }}
                className="text-zinc-600 hover:text-zinc-400 flex-shrink-0" aria-label="Remove file">✕</button>
            )}
          </div>
        ) : (
          <p className="text-zinc-500 text-sm">{dragging ? 'Drop video here' : 'Tap or drag a video file here'}</p>
        )}
      </div>

      {/* Preset selector */}
      <div>
        <p className="text-zinc-400 text-xs mb-2 font-medium uppercase tracking-wide">Watermark Position</p>
        <div className="flex flex-col gap-1.5">
          {PRESETS.map(p => (
            <button key={p.id} onClick={() => !converting && setPreset(p.id)} disabled={converting}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-50
                ${preset === p.id ? 'border-orange-500 bg-orange-950/30' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-600'}`}>
              <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 mt-0.5 ${preset === p.id ? 'border-orange-400 bg-orange-400' : 'border-zinc-600'}`} aria-hidden="true" />
              <div>
                <span className="text-zinc-200 text-xs font-medium">{p.label}</span>
                <span className="text-zinc-600 text-xs ml-2">{p.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom coordinates */}
      {isCustom && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-zinc-400 text-xs font-medium">Watermark pixel coordinates</p>
          <div className="grid grid-cols-2 gap-2">
            {['x','y','w','h'].map(key => (
              <div key={key} className="flex flex-col gap-1">
                <label className="text-zinc-500 text-xs uppercase">{key === 'w' ? 'Width' : key === 'h' ? 'Height' : key.toUpperCase()}</label>
                <input type="number" min={0} value={custom[key]}
                  onChange={(e) => setCustom(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none" />
              </div>
            ))}
          </div>
          <p className="text-zinc-600 text-xs">Tip: use browser DevTools or a photo editor to find the exact watermark pixel position.</p>
        </div>
      )}

      {/* Status + progress */}
      {statusMsg && <p className="text-zinc-400 text-xs text-center">{statusMsg}</p>}
      {converting && (
        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
          <div className="h-1.5 bg-orange-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      )}

      {/* Action buttons */}
      {file && !resultUrl && !converting && (
        <button onClick={handleRemove}
          className="w-full bg-orange-600 hover:bg-orange-500 text-white font-semibold py-3 rounded-xl transition-colors">
          Remove Watermark
        </button>
      )}

      {resultUrl && (
        <div className="flex flex-col gap-2">
          <button onClick={saveVideo}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors">
            ✓ Download Clean Video
          </button>
          <button onClick={() => { reset(); setFile(null); }}
            className="text-zinc-500 hover:text-zinc-300 text-xs text-center py-1 transition-colors">
            Process another video
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-red-400 flex-shrink-0">⚠</span>
          <div className="flex-1">
            <p className="text-red-300 text-xs">{error}</p>
            <button onClick={reset} className="text-red-400 hover:text-red-300 text-xs mt-1 underline">Try again</button>
          </div>
        </div>
      )}
    </section>
  );
}
