/**
 * StatusTicker.jsx
 * Horizontally scrolling marquee strip shown between the header and main content.
 * Displays tips and supported-platform info.
 */

import { useEffect, useRef } from 'react';

const MESSAGES = [
  '✅ Facebook videos & reels supported',
  '✅ X / Twitter videos supported',
  '✅ Instagram reels & stories supported',
  '🎵 Extract audio as MP3 or M4A',
  '📱 Works on mobile & desktop',
  '🔒 No sign-in required',
  '⚡ Fast server-side processing',
  '📥 Download in 360p · 480p · 720p · 1080p',
];

export default function StatusTicker() {
  const trackRef = useRef(null);

  // Duplicate items so the loop is seamless
  const items = [...MESSAGES, ...MESSAGES];

  return (
    <div
      className="w-full overflow-hidden bg-zinc-900 border-y border-zinc-800 py-2"
      aria-hidden="true"          // decorative; screen readers skip it
    >
      <div
        ref={trackRef}
        className="flex gap-10 whitespace-nowrap animate-ticker"
        style={{ willChange: 'transform' }}
      >
        {items.map((msg, i) => (
          <span key={i} className="text-xs text-zinc-400 flex-shrink-0">
            {msg}
          </span>
        ))}
      </div>

      {/* Inline keyframes so the component is self-contained */}
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 28s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
