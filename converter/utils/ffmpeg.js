/**
 * FFmpeg wrapper.
 * Builds argument arrays and runs conversions with real-time progress parsing.
 */

const { spawn } = require('child_process');

// Codec and container config per output format
const FORMAT_MAP = {
  mp3:  { codec: 'libmp3lame',  bitrateFlag: '-ab',  lossless: false },
  m4a:  { codec: 'aac',         bitrateFlag: '-ab',  lossless: false, extra: ['-movflags', '+faststart'] },
  aac:  { codec: 'aac',         bitrateFlag: '-ab',  lossless: false },
  wav:  { codec: 'pcm_s16le',   bitrateFlag: null,   lossless: true  },
  flac: { codec: 'flac',        bitrateFlag: null,   lossless: true  },
  ogg:  { codec: 'libvorbis',   bitrateFlag: '-ab',  lossless: false },
};

function buildArgs(inputPath, outputPath, format, qualityKbps) {
  const { codec, bitrateFlag, lossless, extra = [] } = FORMAT_MAP[format];
  const args = [
    '-i', inputPath,
    '-vn',              // strip video
    '-acodec', codec,
  ];
  if (!lossless && bitrateFlag) args.push(bitrateFlag, `${qualityKbps}k`);
  args.push(...extra, '-y', outputPath);
  return args;
}

/**
 * Run FFmpeg conversion.
 * @param {string}   inputPath   - absolute path to input video file
 * @param {string}   outputPath  - absolute path for output audio file
 * @param {string}   format      - one of mp3 | m4a | aac | wav | flac | ogg
 * @param {number}   qualityKbps - bitrate in kbps (ignored for wav/flac)
 * @param {Function} onProgress  - called with { progress: 0-100, eta: seconds }
 * @returns {Promise<void>}
 */
function runFFmpeg(inputPath, outputPath, format, qualityKbps, onProgress) {
  return new Promise((resolve, reject) => {
    const args = buildArgs(inputPath, outputPath, format, qualityKbps);
    const ff   = spawn('ffmpeg', args);

    let duration = null;
    let lastProgress = 0;
    let stderrBuf = '';

    ff.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuf  = (stderrBuf + text).slice(-2000); // keep last 2KB for error reporting

      // Parse total duration once
      if (!duration) {
        const m = text.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (m) {
          duration = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
        }
      }

      // Parse current time → derive progress %
      if (duration > 0) {
        const t = text.match(/time=\s*(\d+):(\d+):(\d+\.?\d*)/);
        if (t) {
          const current  = +t[1] * 3600 + +t[2] * 60 + parseFloat(t[3]);
          const progress = Math.min(99, Math.round((current / duration) * 100));
          if (progress !== lastProgress) {
            lastProgress = progress;
            const elapsed = current;
            const eta     = elapsed > 0
              ? Math.round((duration - current) / (current / elapsed))
              : null;
            onProgress({ progress, eta });
          }
        }
      }
    });

    ff.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`FFmpeg exited ${code}: ${stderrBuf.slice(-300)}`));
    });

    ff.on('error', (err) => reject(new Error(`FFmpeg spawn error: ${err.message}`)));
  });
}

/**
 * Estimate output file size in bytes.
 * Returns null if format is lossless (file size depends on audio content).
 */
function estimateSize(durationSeconds, format, qualityKbps) {
  if (['wav', 'flac'].includes(format)) return null;
  return Math.round((qualityKbps * 1000 / 8) * durationSeconds);
}

module.exports = { runFFmpeg, estimateSize };
