/**
 * utils/ffmpeg.js — v2
 *
 * Key fixes:
 *   - Removed -vn flag (conflicts with -map in FFmpeg 8.x causing exit 234)
 *   - -map 0:a:0 alone is sufficient — no video can enter an audio container
 *   - Added probeAudioStream() ffprobe check so we catch "no audio" early
 *     with a friendly message instead of a cryptic FFmpeg error
 */

const { spawn } = require('child_process');

const FORMAT_MAP = {
  mp3:  { codec: 'libmp3lame', lossless: false },
  m4a:  { codec: 'aac',        lossless: false, extra: ['-movflags', '+faststart'] },
  aac:  { codec: 'aac',        lossless: false },
  wav:  { codec: 'pcm_s16le',  lossless: true  },
  flac: { codec: 'flac',       lossless: true  },
  ogg:  { codec: 'libvorbis',  lossless: false },
};

/**
 * Use ffprobe to check if the input file contains at least one audio stream.
 * Returns true if audio found, false if video-only.
 */
function probeAudioStream(inputPath) {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', [
      '-v',            'error',
      '-select_streams','a',
      '-show_entries', 'stream=codec_type',
      '-of',           'json',
      inputPath,
    ]);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.on('close', () => {
      try {
        const data    = JSON.parse(out);
        resolve(Array.isArray(data.streams) && data.streams.length > 0);
      } catch {
        resolve(false);
      }
    });
    p.on('error', () => resolve(false));
  });
}

/**
 * Run FFmpeg audio extraction.
 * NOTE: -vn is intentionally omitted. In FFmpeg 8.x, combining -vn with
 * -map 0:a:0 causes "Failed to set value '0:a:0' for option 'map': Invalid
 * argument". -map 0:a:0 alone selects only audio — no video enters the output.
 */
function runFFmpeg(inputPath, outputPath, format, qualityKbps, onProgress) {
  return new Promise((resolve, reject) => {
    const { codec, lossless, extra = [] } = FORMAT_MAP[format];

    const args = [
      '-i',     inputPath,
      '-map',   '0:a:0',          // select first audio stream only
      '-acodec', codec,
    ];

    if (!lossless) args.push('-b:a', `${qualityKbps}k`);
    args.push(...extra, '-y', outputPath);

    const ff        = spawn('ffmpeg', args);
    let duration    = null;
    let lastPct     = 0;
    let stderrBuf   = '';

    ff.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuf  = (stderrBuf + text).slice(-3000);

      if (!duration) {
        const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (m) duration = +m[1]*3600 + +m[2]*60 + parseFloat(m[3]);
      }
      if (duration > 0) {
        const t = text.match(/time=\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (t) {
          const cur = +t[1]*3600 + +t[2]*60 + parseFloat(t[3]);
          const pct = Math.min(99, Math.round((cur / duration) * 100));
          if (pct !== lastPct) {
            lastPct = pct;
            const eta = cur > 0 ? Math.round((duration - cur) / (cur / duration)) : null;
            onProgress({ progress: pct, eta });
          }
        }
      }
    });

    ff.on('close',  code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${stderrBuf.slice(-400)}`)));
    ff.on('error',  err  => reject(new Error(`FFmpeg spawn error: ${err.message}`)));
  });
}

module.exports = { runFFmpeg, probeAudioStream };
