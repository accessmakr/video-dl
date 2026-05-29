import { useState } from 'react';
import { startDownload } from '../services/api';

export default function DownloadButton({ url, formatId, onJobStart }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      const { job_id } = await startDownload(url, formatId);
      onJobStart(job_id);
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading || !formatId}
      className="w-full max-w-2xl bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors"
    >
      {loading ? 'Starting…' : 'Download'}
    </button>
  );
}
