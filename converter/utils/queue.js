/**
 * Async job processor.
 * Downloads video from URL (if needed) then runs FFmpeg conversion.
 * All I/O is streamed to /tmp to avoid memory overload on free tier.
 */

const fs   = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const { Readable }  = require('stream');
const { getJob, updateJob } = require('./jobs');
const { runFFmpeg }          = require('./ffmpeg');

const UPLOAD_DIR = '/tmp/uploads';

/**
 * Stream a remote URL to disk without buffering in memory.
 */
async function downloadUrl(url, destPath) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0',
    },
  });
  if (!res.ok) throw new Error(`Remote fetch failed: HTTP ${res.status}`);
  const writer = fs.createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body), writer);
}

/**
 * Process a single job.
 * Called asynchronously immediately after job creation.
 */
async function processJob(jobId) {
  const job = getJob(jobId);
  if (!job) return;

  let inputPath = job.inputPath;

  try {
    // Step 1 — download if URL-based
    if (!inputPath && job.inputUrl) {
      updateJob(jobId, { status: 'downloading', statusText: 'Downloading video…' });
      const ext  = (job.inputUrl.split('?')[0].split('.').pop() || 'mp4').slice(0, 5);
      inputPath  = path.join(UPLOAD_DIR, `${jobId}.${ext}`);
      await downloadUrl(job.inputUrl, inputPath);
      updateJob(jobId, { inputPath });
    }

    // Step 2 — convert
    updateJob(jobId, { status: 'converting', statusText: 'Converting…', progress: 0 });

    await runFFmpeg(
      inputPath,
      job.outputPath,
      job.format,
      job.quality,
      ({ progress, eta }) => updateJob(jobId, { progress, eta })
    );

    // Step 3 — done
    const { size } = fs.statSync(job.outputPath);
    updateJob(jobId, {
      status:        'done',
      statusText:    'Complete',
      progress:      100,
      eta:           null,
      fileSizeBytes: size,
    });

  } catch (err) {
    updateJob(jobId, {
      status:     'error',
      statusText: 'Conversion failed',
      error:      err.message,
      progress:   0,
    });
  } finally {
    // Always clean up the input after processing
    if (inputPath && fs.existsSync(inputPath)) {
      try { fs.unlinkSync(inputPath); } catch {}
    }
  }
}

module.exports = { processJob };
