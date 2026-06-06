/**
 * StatusTicker.jsx
 * Continuous horizontal scrolling ticker showing all live site features.
 * Pure CSS animation — zero JavaScript loops.
 */

const ITEMS = [
  { icon: '🟢', label: 'Facebook Video Download',    status: 'LIVE'    },
  { icon: '🟢', label: 'Twitter / X Video Download', status: 'LIVE'    },
  { icon: '🟢', label: 'Instagram Video Download',   status: 'LIVE'    },
  { icon: '🟢', label: 'MP3 Audio Extraction',        status: 'LIVE'    },
  { icon: '🟢', label: 'M4A Conversion',              status: 'LIVE'    },
  { icon: '🟢', label: 'AAC Conversion',              status: 'LIVE'    },
  { icon: '🟢', label: 'WAV Lossless Export',         status: 'LIVE'    },
  { icon: '🟢', label: 'FLAC Hi-Fi Export',           status: 'LIVE'    },
  { icon: '🟢', label: 'OGG Conversion',              status: 'LIVE'    },
  { icon: '🟢', label: 'Quality 64 – 320 kbps',       status: 'LIVE'    },
  { icon: '🟢', label: 'Drag & Drop Upload',          status: 'LIVE'    },
  { icon: '🟢', label: 'Files up to 500 MB',          status: 'LIVE'    },
  { icon: '🟡', label: 'Watermark Removal',           status: 'SOON'    },
  { icon: '🟡', label: 'Video Format Converter',      status: 'SOON'    },
  { icon: '🟡', label: 'Batch Conversion',            status: 'SOON'    },
  { icon: '🟡', label: 'TikTok Download',             status: 'SOON'    },
  { icon: '🔴', label: 'YouTube Download',            status: 'PENDING' },
  { icon: '🟢', label: 'Free — No Sign-Up',           status: 'LIVE'    },
  { icon: '🟢', label: 'Mobile First Design',         status: 'LIVE'    },
  { icon: '🟢', label: 'Privacy — Files Auto-Deleted', status: 'LIVE'   },
];

const STATUS_COLOURS = {
  LIVE:    'text-green-400',
  SOON:    'text-yellow-400',
  PENDING: 'text-red-400',
};

function TickerItem({ icon, label, status }) {
  return (
    <span className="inline-flex items-center gap-2 px-6 whitespace-nowrap select-none">
      <span aria-hidden="true">{icon}</span>
      <span className="text-zinc-200 text-xs font-medium tracking-wide">{label}</span>
      <span className={`text-xs font-bold uppercase ${STATUS_COLOURS[status]}`}>
        {status}
      </span>
      <span className="text-zinc-700 mx-2" aria-hidden="true">•</span>
    </span>
  );
}

export default function StatusTicker() {
  // Duplicate items so the second copy fills seamlessly while first scrolls off
  const doubled = [...ITEMS, ...ITEMS];

  return (
    <div
      className="w-full bg-zinc-900 border-y border-zinc-800 overflow-hidden py-2"
      role="marquee"
      aria-label="Live feature status"
      aria-live="off"
    >
      <div
        className="flex animate-ticker"
        style={{ width: 'max-content' }}
      >
        {doubled.map((item, i) => (
          <TickerItem key={i} {...item} />
        ))}
      </div>

      {/* Ticker animation — injected as a style tag to avoid Tailwind purge */}
      <style>{`
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker {
          animation: ticker 60s linear infinite;
        }
        .animate-ticker:hover {
          animation-play-state: paused;
        }
      `}</style>
    </div>
  );
}
