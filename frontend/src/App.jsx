import { useState, useEffect } from 'react';
import lamejs from 'lamejs';
import { getDownloadLink, getPreview } from './services/api';

const QUALITIES = ['360', '480', '720', '1080'];

const PLATFORMS = [
  { id: 'facebook',  label: 'Facebook',    icon: 'f',  color: 'text-blue-400', patterns: [/facebook\.com/, /fb\.watch/] },
  { id: 'twitter',   label: 'X / Twitter', icon: '𝕏',  color: 'text-zinc-200', patterns: [/twitter\.com/, /x\.com/] },
  { id: 'instagram', label: 'Instagram',   icon: '◎', color: 'text-pink-400', patterns: [/instagram\.com/] },
];

function detectPlatform(url) {
  try { new URL(url); } catch { return null; }
  return PLATFORMS.find(p => p.patterns.some(r => r.test(url))) ?? null;
}

function isValidURL(u) {
  try { new URL(u); return true; } catch { return false; }
}

function openVideo(href) {
  window.open(href, '_blank', 'noopener,noreferrer');
}

function floatToInt16(input) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
}

function Mp3Converter() {
  const [file,       setFile]       = useState(null);
  const [converting, setConverting] = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [mp3Url,     setMp3Url]     = useState(null);
  const [mp3Name,    setMp3Name]    = useState('audio.mp3');
  const [error,      setError]      = useState(null);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setMp3Url(null);
    setError(null);
    setProgress(0);
    setMp3Name(f.name.replace(/\.[^.]+$/, '') + '.mp3');
  };

  const convert = async () => {
    if (!file) return;
    setConverting(true);
    setError(null);
    setMp3Url(null);
    setProgress(0);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx    = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      await audioCtx.close();

      const channels   = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const left       = audioBuffer.getChannelData(0);
      const right      = channels > 1 ? audioBuffer.getChannelData(1) : audioBuffer.getChannelData(0);
      const encoder    = new lamejs.Mp3Encoder(channels, sampleRate, 128);
      const mp3Chunks  = [];
      const blockSize  = 1152;

      for (let i = 0; i < left.length; i += blockSize) {
        const lChunk = floatToInt16(left.subarray(i, i + blockSize));
        const rChunk = floatToInt16(right.subarray(i, i + blockSize));
        const chunk  = encoder.encodeBuffer(lChunk, rChunk);
        if (chunk.length > 0) mp3Chunks.push(new Uint8Array(chunk));
        setProgress(Math.round((i / left.length) * 95));
        if (i % (blockSize * 200) === 0) await new Promise(r => setTimeout(r, 0));
      }

      const tail = encoder.flush();
      if (tail.length > 0) mp3Chunks.push(new Uint8Array(tail));

      const blob = new Blob(mp3Chunks, { type: 'audio/mpeg' });
      setMp3Url(URL.createObjectURL(blob));
      setProgress(100);
    } catch {
      setError('Could not read audio from this file. Try a different video.');
    } finally {
      setConverting(false);
    }
  };

  const saveMp3 = () => {
    if (!mp3Url) return;
    const a = document.createElement('a');
    a.href = mp3Url;
    a.download = mp3Name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="w-full max-w-xl border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      <div>
        <h2 className="text-white font-semibold text-sm">Convert Video to MP3</h2>
        <p className="text-zinc-500 text-xs mt-0.5">
          Download the video first, then select it here to extract audio
        </p>
      </div>

      <label className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-xl p-5 text-center cursor-pointer transition-colors">
        <input type="file" accept="video/*,audio/*,.mp4,.mov,.avi,.webm,.mkv" onChange={handleFile} className="hidden" />
        {file ? (
          <p className="text-zinc-300 text-sm truncate">{file.name}</p>
        ) : (
          <p className="text-zinc-500 text-sm">Tap to select downloaded video</p>
        )}
      </label>

      {file && !mp3Url && (
        <button
          onClick={convert}
          disabled={converting}
          className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl text-sm transition-colors"
        >
          {converting ? `Converting… ${progress}%` : 'Extract MP3'}
        </button>
      )}

      {converting && (
        <div className="w-full bg-zinc-800 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-1.5 bg-purple-500 rounded-full transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {mp3Url && (
        <button
          onClick={saveMp3}
          className="bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl text-sm text-center transition-colors"
        >
          ✓ Save {mp3Name}
        </button>
      )}

      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
    </div>
  );
}

export default function App() {
  const [url,        setUrl]        = useState('');
  const [quality,    setQuality]    = useState('720');
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);
  const [preview,    setPreview]    = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const platform = detectPlatform(url);
  const reset    = () => { setResult(null); setError(null); };
  const isStream = result?.status === 'redirect' || result?.status === 'stream';

  useEffect(() => {
    if (!platform) { setPreview(null); return; }
    let cancelled = false;
    setPreviewing(true);
    setPreview(null);
    getPreview(url).then(data => {
      if (!cancelled) { setPreview(data); setPreviewing(false); }
    }).catch(() => {
      if (!cancelled) setPreviewing(false);
    });
    return () => { cancelled = true; };
  }, [url]);

  const handleSubmit = async () => {
    if (!platform) return;
    setLoading(true);
    reset();
    try {
      setResult(await getDownloadLink(url, quality));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center px-4 py-12 gap-6">

      {/* Header */}
      <div className="text-center max-w-xl">
        <h1 className="text-3xl font-bold mb-2">Video Downloader</h1>
        <p className="text-zinc-400 text-sm mb-4">
          Download videos from Facebook, X (Twitter) and Instagram
        </p>
        <div className="flex justify-center gap-6">
          {PLATFORMS.map(p => (
            <span key={p.id} className={`text-sm flex items-center gap-1.5 ${p.color}`}>
              {p.icon} <span className="text-zinc-500">{p.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="w-full max-w-xl flex flex-col gap-3">
        <div className={`flex items-center gap-2 border rounded-xl px-4 py-3 bg-zinc-900 transition-colors ${
          platform        ? 'border-blue-500' :
          isValidURL(url) ? 'border-red-700'  :
                            'border-zinc-700 focus-within:border-zinc-500'
        }`}>
          {platform && (
            <span className={`text-lg flex-shrink-0 ${platform.color}`}>{platform.icon}</span>
          )}
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); reset(); }}
            placeholder="Paste Facebook, Twitter or Instagram URL…"
            className="flex-1 bg-transparent text-white outline-none placeholder-zinc-500 text-sm"
            autoFocus
          />
          {url && (
            <button
              onClick={() => { setUrl(''); reset(); setPreview(null); }}
              className="text-zinc-600 hover:text-zinc-400 flex-shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        {isValidURL(url) && !platform && (
          <p className="text-red-400 text-xs text-center">
            Only Facebook, X (Twitter) and Instagram links are supported
          </p>
        )}

        {/* Thumbnail preview card — shows while loading and when thumbnail found */}
        {platform && (previewing || preview) && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex gap-3 p-3 items-center">
            {/* Thumbnail or platform icon placeholder */}
            {previewing && !preview?.thumbnail ? (
              <div className="w-28 h-16 bg-zinc-800 rounded-lg flex-shrink-0 animate-pulse" />
            ) : preview?.thumbnail ? (
              <img
                src={preview.thumbnail}
                alt=""
                className="w-28 h-16 object-cover rounded-lg flex-shrink-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            ) : (
              <div className={`w-28 h-16 bg-zinc-800 rounded-lg flex-shrink-0 flex items-center justify-center text-3xl ${platform.color}`}>
                {platform.icon}
              </div>
            )}

            <div className="flex flex-col gap-1 overflow-hidden flex-1">
              {previewing && !preview?.title ? (
                <div className="h-4 bg-zinc-800 rounded animate-pulse w-3/4" />
              ) : (
                <p className="text-white text-sm font-medium line-clamp-2">
                  {preview?.title || platform.label + ' Video'}
                </p>
              )}
              <span className={`text-xs ${platform.color}`}>
                {platform.icon} {platform.label}
              </span>
            </div>
          </div>
        )}

        {platform && (
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none"
          >
            {QUALITIES.map(q => <option key={q} value={q}>{q}p</option>)}
          </select>
        )}

        <button
          onClick={handleSubmit}
          disabled={!platform || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {loading ? 'Getting link…' : 'Get Download Link'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="w-full max-w-xl bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Single video result */}
      {isStream && (
        <div className="w-full max-w-xl flex flex-col gap-2">
          <button
            onClick={() => openVideo(result.url)}
            className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl text-center transition-colors"
          >
            ✓ Open Video
          </button>
          {/* Mobile download instruction — always shown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-zinc-400 text-lg mt-0.5">📱</span>
            <div>
              <p className="text-zinc-300 text-xs font-medium">To save the video to your phone:</p>
              <p className="text-zinc-500 text-xs mt-1">
                Tap <strong className="text-zinc-300">Open Video</strong> above → video plays in browser → tap the
                <strong className="text-zinc-300"> ⋮ three dots</strong> at the bottom right of the player → tap
                <strong className="text-zinc-300"> Download</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Picker — Instagram carousels / multiple items */}
      {result?.status === 'picker' && (
        <div className="w-full max-w-xl flex flex-col gap-3">
          <p className="text-zinc-400 text-sm text-center">Multiple items — tap each to open, then ⋮ → Download</p>
          <div className="grid grid-cols-2 gap-2">
            {result.picker.map((item, i) => (
              <button
                key={i}
                onClick={() => openVideo(item.url)}
                className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden hover:border-zinc-500 transition-colors text-left"
              >
                {item.thumb && <img src={item.thumb} alt="" className="w-full h-32 object-cover" />}
                <p className="p-2 text-xs text-zinc-400 text-center">🎬 Item {i + 1}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="w-full max-w-xl border-t border-zinc-800" />

      <Mp3Converter />

      <footer className="mt-auto pt-8 text-center text-zinc-700 text-xs max-w-xl space-y-1">
        <p>Download Facebook Videos · Download Facebook Reels · Save Facebook Stories</p>
        <p>Download Twitter Videos · Save X Videos · Twitter Video Saver</p>
        <p>Download Instagram Reels · Save Instagram Videos · Instagram Story Downloader</p>
      </footer>

    </div>
  );
}
