export default function ProgressPanel({ job }) {
  if (!job) return null;

  const progress = job.progress ?? 0;
  const speed    = job.speed ? `${(job.speed / 1024 / 1024).toFixed(1)} MB/s` : '';
  const eta      = job.eta ? `${job.eta}s left` : '';

  const statusLabel = {
    queued:      'Queued…',
    downloading: 'Downloading…',
    done:        '✓ Complete',
    error:       '✗ Error',
  }[job.status] ?? job.status;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-2">
      <div className="flex justify-between text-sm text-zinc-400">
        <span>{statusLabel}</span>
        <span className="text-xs text-zinc-500">{speed} {eta}</span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${
            job.status === 'error' ? 'bg-red-500' :
            job.status === 'done'  ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {job.status === 'error' && (
        <p className="text-xs text-red-400">{job.error}</p>
      )}
    </div>
  );
}
