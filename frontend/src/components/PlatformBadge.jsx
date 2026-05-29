const ICONS = {
  youtube:     '▶',
  twitter:     '𝕏',
  tiktok:      '♪',
  instagram:   '◎',
  facebook:    'f',
  vimeo:       'V',
  reddit:      '●',
  twitch:      '♟',
  dailymotion: 'D',
  other:       '🎬',
};

export default function PlatformBadge({ platform }) {
  if (!platform) return null;
  return (
    <span className="text-zinc-400 text-base w-5 flex-shrink-0 text-center select-none">
      {ICONS[platform.id] ?? '🎬'}
    </span>
  );
}
