import { formatBytes } from '../utils/formatBytes';

export default function FormatGrid({ formats, selected, onSelect }) {
  const filtered = formats.filter(
    (f) => f.vcodec && f.vcodec !== 'none' && f.height
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 w-full max-w-2xl">
      {filtered.map((f) => (
        <button
          key={f.format_id}
          onClick={() => onSelect(f.format_id)}
          className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
            selected === f.format_id
              ? 'border-blue-500 bg-blue-950 text-white'
              : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
          }`}
        >
          <span className="font-bold text-sm">{f.height}p</span>
          {f.fps > 30 && <span className="text-xs text-yellow-400">{f.fps} fps</span>}
          <span className="text-xs text-zinc-500 mt-1">{f.ext.toUpperCase()}</span>
          <span className="text-xs text-zinc-600">{formatBytes(f.filesize)}</span>
        </button>
      ))}
      <button
        onClick={() => onSelect('bestaudio/best')}
        className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
          selected === 'bestaudio/best'
            ? 'border-green-500 bg-green-950 text-white'
            : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
        }`}
      >
        <span className="font-bold text-sm">Audio only</span>
        <span className="text-xs text-zinc-500 mt-1">MP3 / M4A</span>
      </button>
    </div>
  );
}
