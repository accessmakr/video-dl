/**
 * utils/queue.js — v2
 * Uses probeAudioStream() before attempting conversion.
 * Shows friendly "no audio track" error instead of FFmpeg exit code.
 */

const fs   = require('fs');
const path = require('path');
const { Readable }               = require('stream');
const { pipeline }               = require('stream/promises');
const { getJob, updateJob }      = require('./jobs');
const { runFFmpeg, probeAudioStream } = require('./ffmpeg');

const UPLOAD_DIR = '/tmp/uploads';

async function downloadUrl(url, destPath) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0' },
  });
  if (!res.ok) throw new Error(`Remote fetch failed: HTTP ${res.status}`);
  const writer = fs.createWriteStream(destPath);
  await pipeline(Readable.fromWeb(res.body), writer);
}

async function processJob(jobId) {
  const job = getJob(jobId);
  if (!job) return;

  let inputPath = job.inputPath;

  try {
    // Step 1 — download if URL-based
    if (!inputPath && job.inputUrl) {
      updateJob(jobId, { status: 'downloading', statusText: 'Downloading video…' });
      const ext = (job.inputUrl.split('?')[0].split('.').pop() || 'mp4').slice(0, 5);
      inputPath = path.join(UPLOAD_DIR, `${jobId}.${ext}`);
      await downloadUrl(job.inputUrl, inputPath);
      updateJob(jobId, { inputPath });
    }

    // Step 2 — verify audio stream exists before FFmpeg
    updateJob(jobId, { status: 'converting', statusText: 'Checking file…', progress: 0 });
    const hasAudio = await probeAudioStream(inputPath);
    if (!hasAudio) {
      throw new Error('This video has no audio track. Nothing to convert.');
    }

    // Step 3 — convert
    updateJob(jobId, { statusText: 'Converting…' });
    await runFFmpeg(
      inputPath,
      job.outputPath,
      job.format,
      job.quality,
      ({ progress, eta }) => updateJob(jobId, { progress, eta })
    );

    // Step 4 — done
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
    if (inputPath && fs.existsSync(inputPath)) try { fs.unlinkSync(inputPath); } catch {}
  }
}

module.exports = { processJob };
