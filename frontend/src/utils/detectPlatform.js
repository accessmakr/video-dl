const PLATFORMS = [
  { id: 'youtube',     label: 'YouTube',     pattern: /youtube\.com|youtu\.be/ },
  { id: 'twitter',     label: 'X / Twitter', pattern: /twitter\.com|x\.com/ },
  { id: 'tiktok',      label: 'TikTok',      pattern: /tiktok\.com/ },
  { id: 'instagram',   label: 'Instagram',   pattern: /instagram\.com/ },
  { id: 'facebook',    label: 'Facebook',    pattern: /facebook\.com|fb\.watch/ },
  { id: 'vimeo',       label: 'Vimeo',       pattern: /vimeo\.com/ },
  { id: 'reddit',      label: 'Reddit',      pattern: /reddit\.com|redd\.it/ },
  { id: 'twitch',      label: 'Twitch',      pattern: /twitch\.tv/ },
  { id: 'dailymotion', label: 'Dailymotion', pattern: /dailymotion\.com/ },
];

export function detectPlatform(url) {
  if (!url) return null;
  return PLATFORMS.find((p) => p.pattern.test(url)) ?? { id: 'other', label: 'Video' };
}

export function isValidURL(url) {
  try { new URL(url); return true; } catch { return false; }
}
