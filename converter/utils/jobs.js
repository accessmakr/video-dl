/**
 * In-memory job store.
 * Tracks conversion jobs with status, progress, paths, and metadata.
 */

const jobs = new Map();

function createJob(jobId, data) {
  jobs.set(jobId, { ...data });
}

function getJob(jobId) {
  return jobs.get(jobId) || null;
}

function updateJob(jobId, updates) {
  const job = jobs.get(jobId);
  if (job) jobs.set(jobId, { ...job, ...updates });
}

function deleteJob(jobId) {
  jobs.delete(jobId);
}

// Auto-purge jobs older than 2 hours every 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  for (const [id, job] of jobs.entries()) {
    if (job.createdAt < cutoff) jobs.delete(id);
  }
}, 30 * 60 * 1000);

module.exports = { createJob, getJob, updateJob, deleteJob };
