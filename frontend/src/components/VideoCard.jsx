import { formatDuration } from '../utils/formatDuration';

export default function VideoCard({ info }) {
  return (
    <div className="flex gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4 w-full max-w-2xl">
      <img
        src={info.thumbnail}
        alt={info.title}
        className="w-36 h-20 object-cover rounded-lg flex-shrink-0"
      />
      <div className="flex flex-col gap-1 overflow-hidden">
        <p className="text-white font-semibold text-sm line-clamp-2">{info.title}</p>
        <p className="text-zinc-400 text-xs">{info.uploader}</p>
        <div className="flex gap-3 text-zinc-500 text-xs mt-1">
          <span>{formatDuration(info.duration)}</span>
          <span className="uppercase">{info.platform}</span>
        </div>
      </div>
    </div>
  );
}
