/**
 * File and job cleanup utilities.
 * Called after successful downloads or on job expiry.
 */

const fs   = require('fs');
const { getJob, deleteJob } = require('./jobs');

function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch {}
  }
}

function cleanupJob(jobId) {
  const job = getJob(jobId);
  if (!job) return;
  safeUnlink(job.inputPath);
  safeUnlink(job.outputPath);
  deleteJob(jobId);
}

// Schedule cleanup N milliseconds after now
function scheduleCleanup(jobId, delayMs = 10 * 60 * 1000) {
  setTimeout(() => cleanupJob(jobId), delayMs);
}

module.exports = { cleanupJob, scheduleCleanup };
