'use strict';
const fs   = require('fs');
const path = require('path');
const { Readable }  = require('stream');
const { pipeline }  = require('stream/promises');
const { getJob, updateJob } = require('./jobs');
const { probeAudioStream, runAudioFFmpeg } = require('./ffmpeg');

const UPLOAD_DIR = '/tmp/uploads';

async function downloadUrl(url, destPath) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/124.0' } });
  if (!res.ok) throw new Error(`Remote fetch failed: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(destPath));
}

async function processAudioJob(jobId, opts = {}) {
  const job = getJob(jobId);
  if (!job) return;

  let inputPath = job.inputPath;

  try {
    // Download if URL-based
    if (!inputPath && job.inputUrl) {
      updateJob(jobId, { status: 'downloading', statusText: 'Downloading video…' });
      const ext = (job.inputUrl.split('?')[0].split('.').pop() || 'mp4').slice(0,5);
      inputPath = path.join(UPLOAD_DIR, `${jobId}.${ext}`);
      await downloadUrl(job.inputUrl, inputPath);
      updateJob(jobId, { inputPath });
    }

    // Verify audio stream exists before running FFmpeg
    updateJob(jobId, { status: 'converting', statusText: 'Checking file…', progress: 0 });
    const hasAudio = await probeAudioStream(inputPath);
    if (!hasAudio) throw new Error('This file has no audio track to extract.');

    updateJob(jobId, { statusText: 'Converting…' });
    await runAudioFFmpeg(
      inputPath,
      job.outputPath,
      job.format,
      job.quality,
      opts.advanced || job.advanced || {},
      ({ progress, eta }) => updateJob(jobId, { progress, eta })
    );

    const { size } = fs.statSync(job.outputPath);
    updateJob(jobId, { status: 'done', statusText: 'Complete', progress: 100, eta: null, fileSizeBytes: size });

  } catch (err) {
    updateJob(jobId, { status: 'error', statusText: 'Conversion failed', error: err.message, progress: 0 });
  } finally {
    if (inputPath && fs.existsSync(inputPath)) try { fs.unlinkSync(inputPath); } catch {}
  }
}

module.exports = { processAudioJob };
