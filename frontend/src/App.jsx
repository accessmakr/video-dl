import { useState } from 'react';
import { getDownloadLink } from './services/api';

const QUALITIES = ['144', '240', '360', '480', '720', '1080', '1440', '2160'];

function isValidURL(u) {
  try { new URL(u); return true; } catch { return false; }
}

export default function App() {
  const [url,       setUrl]       = useState('');
  const [quality,   setQuality]   = useState('1080');
  const [audioOnly, setAudioOnly] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);

  const reset = () => { setResult(null); setError(null); };

  const handleSubmit = async () => {
    if (!isValidURL(url)) return;
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

  const isStream = result?.status === 'redirect' || result?.status === 'stream';

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center px-4 py-16 gap-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Video Downloader</h1>
        <p className="text-zinc-500 text-sm mt-2">Powered by Cobalt</p>
      </div>

      <div className="w-full max-w-2xl flex flex-col gap-3">
        <input
          type="text"
          value={url}
          onChange={(e) => { setUrl(e.target.value); reset(); }}
          placeholder="Paste video URL here..."
          className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 text-sm outline-none focus:border-blue-500 transition-colors"
          autoFocus
        />

        <div className="flex gap-2">
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value)}
            disabled={audioOnly}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm outline-none disabled:opacity-40"
          >
            {QUALITIES.map((q) => (
              <option key={q} value={q}>{q}p</option>
            ))}
          </select>

          <button
            onClick={() => setAudioOnly(!audioOnly)}
            className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
              audioOnly
                ? 'border-green-500 bg-green-950 text-green-300'
                : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            Audio only
          </button>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!isValidURL(url) || loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {loading ? 'Getting link…' : 'Get Download Link'}
        </button>
      </div>

      {error && (
        <div className="w-full max-w-2xl bg-red-950 border border-red-800 rounded-xl px-4 py-3 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {isStream && (
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full max-w-2xl bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl text-center block transition-colors"
        >
          ✓ Tap here to save your file
        </a>
      )}

      {result?.status === 'picker' && (
        <div className="w-full max-w-2xl flex flex-col gap-3">
          <p className="text-zinc-400 text-sm text-center">
            Multiple items — tap each to save
          </p>
          <div className="grid grid-cols-2 gap-2">
            {result.picker.map((item, i) => (
              <a
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
            <a
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
    </div>
  );
}
