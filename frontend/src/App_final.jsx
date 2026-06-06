/**
 * App.jsx — Final version with:
 * - StatusTicker
 * - Video downloader (Facebook / Twitter / Instagram)
 * - Server-side AudioConverter
 * - Server-side WatermarkRemover
 */

import { useState, useEffect } from 'react';
import { getDownloadLink, getPreview } from './services/api';
import StatusTicker     from './components/StatusTicker';
import AudioConverter   from './components/AudioConverter';
import WatermarkRemover from './components/WatermarkRemover';

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

export default function App() {
  const [url,        setUrl]        = useState('');
  const [quality,    setQuality]    = useState('720');
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState(null);
  const [error,      setError]      = useState(null);
  const [preview,    setPreview]    = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [activeTab,  setActiveTab]  = useState('downloader'); // downloader | converter | watermark

  const [downloadedUrl,  setDownloadedUrl]  = useState(null);
  const [downloadedName, setDownloadedName] = useState(null);

  const platform = detectPlatform(url);
  const isStream = result?.status === 'redirect' || result?.status === 'stream';

  const reset = () => {
    setResult(null);
    setError(null);
    setDownloadedUrl(null);
    setDownloadedName(null);
  };

  useEffect(() => {
    if (!platform) { setPreview(null); return; }
    let cancelled = false;
    setPreviewing(true);
    setPreview(null);
    getPreview(url)
      .then(data => { if (!cancelled) { setPreview(data); setPreviewing(false); } })
      .catch(()  => { if (!cancelled) setPreviewing(false); });
    return () => { cancelled = true; };
  }, [url]);

  useEffect(() => {
    if (isStream && result?.url) {
      setDownloadedUrl(result.url);
      setDownloadedName(preview?.title || platform?.label || 'video');
    }
  }, [result]);

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

  const TABS = [
    { id: 'downloader', label: '⬇ Downloader' },
    { id: 'converter',  label: '🎵 Audio Converter' },
    { id: 'watermark',  label: '🚫 Watermark Remover' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex flex-col items-center px-4 pt-10 pb-4 gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Video Downloader</h1>
        <p className="text-zinc-400 text-sm text-center max-w-md">
          Download · Convert · Remove Watermarks — Free, No Sign-Up
        </p>
        <div className="flex justify-center gap-5 mt-1 flex-wrap">
          {PLATFORMS.map(p => (
            <span key={p.id} className={`text-sm flex items-center gap-1.5 ${p.color}`}>
              <span aria-hidden="true">{p.icon}</span>
              <span className="text-zinc-500">{p.label}</span>
            </span>
          ))}
        </div>
      </header>

      {/* ── Status Ticker ─────────────────────────────────────────────────── */}
      <StatusTicker />

      {/* ── Tab Navigation ───────────────────────────────────────────────── */}
      <nav className="flex justify-center gap-2 px-4 pt-6 pb-2" aria-label="Tool sections">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all border
              ${activeTab === tab.id
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <main className="flex flex-col items-center px-4 py-6 gap-6 flex-1">

        {/* ── DOWNLOADER TAB ── */}
        {activeTab === 'downloader' && (
          <div className="w-full max-w-xl flex flex-col gap-4">

            {/* URL input */}
            <div className={`flex items-center gap-2 border rounded-xl px-4 py-3 bg-zinc-900 transition-colors ${
              platform        ? 'border-blue-500' :
              isValidURL(url) ? 'border-red-700'  :
                                'border-zinc-700 focus-within:border-zinc-500'
            }`}>
              {platform && (
                <span className={`text-lg flex-shrink-0 ${platform.color}`} aria-hidden="true">
                  {platform.icon}
                </span>
              )}
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); reset(); }}
                placeholder="Paste Facebook, Twitter or Instagram URL…"
                className="flex-1 bg-transparent text-white outline-none placeholder-zinc-500 text-sm"
                aria-label="Video URL"
                autoFocus
              />
              {url && (
                <button
                  onClick={() => { setUrl(''); reset(); setPreview(null); }}
                  className="text-zinc-600 hover:text-zinc-400"
                  aria-label="Clear URL"
                >✕</button>
              )}
            </div>

            {isValidURL(url) && !platform && (
              <p className="text-red-400 text-xs text-center" role="alert">
                Only Facebook, X (Twitter) and Instagram links are supported
              </p>
            )}

            {/* Preview card */}
            {platform && (previewing || preview !== null) && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex gap-3 p-3 items-center">
                {previewing && !preview?.thumbnail ? (
                  <div className="w-28 h-16 bg-zinc-800 rounded-lg flex-shrink-0 animate-pulse" />
                ) : preview?.thumbnail ? (
                  <img src={preview.thumbnail} alt="Preview"
                       className="w-28 h-16 object-cover rounded-lg flex-shrink-0" />
                ) : (
                  <div className={`w-28 h-16 bg-zinc-800 rounded-lg flex-shrink-0 flex items-center justify-center text-2xl ${platform.color}`}>
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

            {/* Quality */}
            {platform && (
              <select value={quality} onChange={(e) => setQuality(e.target.value)}
                aria-label="Video quality"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none">
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

            {error && (
              <div className="bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm text-center" role="alert">
                {error}
              </div>
            )}

            {isStream && (
              <div className="flex flex-col gap-2">
                <button onClick={() => openVideo(result.url)}
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors">
                  ✓ Open Video
                </button>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 flex items-start gap-3">
                  <span className="text-lg mt-0.5" aria-hidden="true">📱</span>
                  <div>
                    <p className="text-zinc-300 text-xs font-medium">To save to your phone:</p>
                    <p className="text-zinc-500 text-xs mt-1">
                      Tap <strong className="text-zinc-300">Open Video</strong> → video plays →
                      tap <strong className="text-zinc-300">⋮ three dots</strong> bottom right →
                      tap <strong className="text-zinc-300">Download</strong>
                    </p>
                  </div>
                </div>

                {/* Convert this video shortcut */}
                <div className="flex gap-2">
                  <button onClick={() => setActiveTab('converter')}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium py-2.5 rounded-xl border border-zinc-700 transition-colors">
                    🎵 Convert to Audio
                  </button>
                  <button onClick={() => setActiveTab('watermark')}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium py-2.5 rounded-xl border border-zinc-700 transition-colors">
                    🚫 Remove Watermark
                  </button>
                </div>
              </div>
            )}

            {result?.status === 'picker' && (
              <div className="flex flex-col gap-3">
                <p className="text-zinc-400 text-sm text-center">
                  Multiple items — tap each to open, then ⋮ → Download
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {result.picker.map((item, i) => (
                    <button key={i} onClick={() => openVideo(item.url)}
                      className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden hover:border-zinc-500 transition-colors text-left">
                      {item.thumb && <img src={item.thumb} alt="" className="w-full h-32 object-cover" />}
                      <p className="p-2 text-xs text-zinc-400 text-center">Item {i + 1}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CONVERTER TAB ── */}
        {activeTab === 'converter' && (
          <AudioConverter
            sourceUrl={downloadedUrl}
            sourceFilename={downloadedName}
          />
        )}

        {/* ── WATERMARK TAB ── */}
        {activeTab === 'watermark' && (
          <WatermarkRemover />
        )}

        {/* SEO footer */}
        <footer className="mt-8 text-center text-zinc-700 text-xs max-w-xl space-y-1" aria-hidden="true">
          <p>Download Facebook Videos · Download Facebook Reels · Save Facebook Stories</p>
          <p>Download Twitter Videos · Save X Videos · Twitter Video Saver</p>
          <p>Download Instagram Reels · Save Instagram Videos · Instagram Story Downloader</p>
          <p>Video to MP3 · Video to M4A · Extract Audio from Video · Online Audio Converter</p>
          <p>Remove Video Watermark · TikTok Watermark Remover · Clean Video Download</p>
        </footer>

      </main>
    </div>
  );
}
