/**
 * utils/ffmpeg.js
 * FFmpeg wrapper with explicit stream mapping.
 * Fixed: uses -map 0:a:0 to force-select first audio stream
 *        and -b:a instead of deprecated -ab flag.
 */

const { spawn } = require('child_process');

const FORMAT_MAP = {
  mp3:  { codec: 'libmp3lame', ext: 'mp3',  lossless: false },
  m4a:  { codec: 'aac',        ext: 'm4a',  lossless: false, extra: ['-movflags', '+faststart'] },
  aac:  { codec: 'aac',        ext: 'aac',  lossless: false },
  wav:  { codec: 'pcm_s16le',  ext: 'wav',  lossless: true  },
  flac: { codec: 'flac',       ext: 'flac', lossless: true  },
  ogg:  { codec: 'libvorbis',  ext: 'ogg',  lossless: false },
};

function buildArgs(inputPath, outputPath, format, qualityKbps) {
  const { codec, lossless, extra = [] } = FORMAT_MAP[format];

  const args = [
    '-i',    inputPath,
    '-vn',               // strip all video streams
    '-map',  '0:a:0',   // explicitly select first audio stream (fixes "no stream" error)
  ];

  // Codec
  args.push('-acodec', codec);

  // Bitrate — use -b:a (not deprecated -ab)
  if (!lossless) args.push('-b:a', `${qualityKbps}k`);

  // Format-specific extras (e.g. faststart for m4a)
  args.push(...extra);

  // Always overwrite output
  args.push('-y', outputPath);

  return args;
}

/**
 * Run FFmpeg audio extraction.
 * Resolves when done, rejects with error message if FFmpeg exits non-zero.
 */
function runFFmpeg(inputPath, outputPath, format, qualityKbps, onProgress) {
  return new Promise((resolve, reject) => {
    const args = buildArgs(inputPath, outputPath, format, qualityKbps);
    const ff   = spawn('ffmpeg', args);

    let duration    = null;
    let lastProgress = 0;
    let stderrBuf   = '';

    ff.stderr.on('data', (chunk) => {
      const text  = chunk.toString();
      stderrBuf   = (stderrBuf + text).slice(-3000);

      // Parse total duration once
      if (!duration) {
        const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (m) duration = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
      }

      // Parse current time → progress %
      if (duration > 0) {
        const t = text.match(/time=\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (t) {
          const cur      = +t[1] * 3600 + +t[2] * 60 + parseFloat(t[3]);
          const progress = Math.min(99, Math.round((cur / duration) * 100));
          if (progress !== lastProgress) {
            lastProgress = progress;
            const eta    = cur > 0 ? Math.round((duration - cur) / (cur / duration)) : null;
            onProgress({ progress, eta });
          }
        }
      }
    });

    ff.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`FFmpeg exited ${code}: ${stderrBuf.slice(-400)}`));
    });

    ff.on('error', (err) => reject(new Error(`FFmpeg spawn error: ${err.message}`)));
  });
}

module.exports = { runFFmpeg };
