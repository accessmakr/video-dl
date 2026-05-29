import { useState } from 'react';
import { isValidURL, detectPlatform } from '../utils/detectPlatform';
import PlatformBadge from './PlatformBadge';

export default function URLInput({ onAnalyze, loading }) {
  const [url, setUrl] = useState('');
  const platform      = detectPlatform(url);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValidURL(url)) return;
    onAnalyze(url.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-full max-w-2xl">
      <div className="flex gap-2 items-center border border-zinc-700 rounded-xl px-4 py-3 bg-zinc-900 focus-within:border-blue-500 transition-colors">
        {platform && <PlatformBadge platform={platform} />}
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste video URL here..."
          className="flex-1 bg-transparent text-white outline-none placeholder-zinc-500 text-sm"
          autoFocus
        />
      </div>
      <button
        type="submit"
        disabled={!isValidURL(url) || loading}
        className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-colors"
      >
        {loading ? 'Analyzing…' : 'Get Video'}
      </button>
    </form>
  );
}
