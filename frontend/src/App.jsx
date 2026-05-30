import { useState } from 'react';
import { getDownloadLink } from './services/api';

const QUALITIES = ['360', '480', '720', '1080'];

const PLATFORMS = [
  { id: 'facebook',  label: 'Facebook',    icon: 'f',  color: 'text-blue-400',  patterns: [/facebook\.com/, /fb\.watch/] },
  { id: 'twitter',   label: 'X / Twitter', icon: '𝕏',  color: 'text-zinc-200',  patterns: [/twitter\.com/, /x\.com/] },
  { id: 'instagram', label: 'Instagram',   icon: '◎', color: 'text-pink-400',  patterns: [/instagram\.com/] },
];

function detectPlatform(url) {
  try { new URL(url); } catch { return null; }
  return PLATFORMS.find(p => p.patterns.some(r => r.test(url))) ?? null;
}

function isValidURL(u) {
  try { new URL(u); return true; } catch { return false; }
}

export default function App() {
  const [url,       setUrl]       = useState('');
  const [quality,   setQuality]   = useState('720');
  const [audioOnly, setAudioOnly] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);

  const platform = detectPlatform(url);
  const reset    = () => { setResult(null); setError(null); };
  const isStream = result?.status === 'redirect' || result?.status === 'stream';

  const handleSubmit = async () => {
    if (!platform) return;
    setLoading(true);
    reset();
    try {
      setResult(await getDownloadLink(url, quality, audioOnly));
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
          Download videos and audio from Facebook, X (Twitter) and Instagram
        </p>
        <div className="flex justify-center gap-6">
          {PLATFORMS.map(p => (
            <span key={p.id} className={`text-sm font-medium flex items-center gap-1.5 ${p.color}`}>
              <span>{p.icon}</span>
              <span className="text-zinc-400">{p.label}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="w-full max-w-xl flex flex-col gap-3">
        <div className={`flex items-center gap-2 border rounded-xl px-4 py-3 bg-zinc-900 transition-colors ${
          platform            ? 'border-blue-500' :
          isValidURL(url)     ? 'border-red-700'  :
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
        </div>

        {isValidURL(url) && !platform && (
          <p className="text-red-400 text-xs text-center">
            Only Facebook, X (Twitter) and Instagram links are supported
          </p>
        )}

        {platform && (
          <div className="flex gap-2">
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value)}
              disabled={audioOnly}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none disabled:opacity-40"
            >
              {QUALITIES.map(q => (
                <option key={q} value={q}>{q}p</option>
              ))}
            </select>

            <button
              onClick={() => setAudioOnly(!audioOnly)}
              className={`px-4 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                audioOnly
                  ? 'border-green-500 bg-green-950 text-green-300'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
              }`}
            >
              Audio only
            </button>
          </div>
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

      {/* Single file download */}
      {isStream && (
        
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full max-w-xl bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl text-center block transition-colors"
        >
          ✓ Tap here to save your file
        </a>
      )}

      {/* Picker — Instagram carousels / multiple items */}
      {result?.status === 'picker' && (
        <div className="w-full max-w-xl flex flex-col gap-3">
          <p className="text-zinc-400 text-sm text-center">Multiple items found — tap each to save</p>
          <div className="grid grid-cols-2 gap-2">
            {result.picker.map((item, i) => (
              
                key={i}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden hover:border-zinc-500 transition-colors"
              >
                {item.thumb && (
                  <img src={item.thumb} alt="" className="w-full h-32 object-cover" />
                )}
                <p className="p-2 text-xs text-zinc-400 text-center">
                  {item.type === 'video' ? '🎬' : '🖼'} Item {i + 1}
                </p>
              </a>
            ))}
          </div>
          {result.audio && (
            
              href={result.audio}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-zinc-900 border border-green-800 rounded-xl p-3 text-center text-sm text-green-400 hover:border-green-600 transition-colors"
            >
              🎵 Tap to save audio track
            </a>
          )}
        </div>
      )}

      {/* SEO footer */}
      <footer className="mt-auto pt-12 text-center text-zinc-700 text-xs max-w-xl space-y-1">
        <p>Download Facebook Videos · Download Facebook Reels · Save Facebook Stories</p>
        <p>Download Twitter Videos · Save X Videos · Twitter Video Saver</p>
        <p>Download Instagram Reels · Save Instagram Videos · Instagram Story Downloader</p>
      </footer>

    </div>
  );
}
