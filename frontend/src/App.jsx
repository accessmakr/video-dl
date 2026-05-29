import { useState, useEffect } from 'react';
import URLInput       from './components/URLInput';
import VideoCard      from './components/VideoCard';
import FormatGrid     from './components/FormatGrid';
import ProgressPanel  from './components/ProgressPanel';
import DownloadButton from './components/DownloadButton';
import { useVideoInfo }   from './hooks/useVideoInfo';
import { useJobPoller }   from './hooks/useJobPoller';
import { getDownloadURL } from './services/api';

export default function App() {
  const { info, loading: analyzing, error, analyze } = useVideoInfo();
  const [currentURL,  setCurrentURL]  = useState('');
  const [selectedFmt, setSelectedFmt] = useState(null);
  const [jobId,       setJobId]       = useState(null);
  const job = useJobPoller(jobId);

  useEffect(() => {
    if (info?.formats?.length) {
      const best = info.formats.find((f) => f.height <= 1080 && f.vcodec !== 'none');
      setSelectedFmt(best?.format_id ?? 'best');
    }
  }, [info]);

  const handleAnalyze = (url) => {
    setCurrentURL(url);
    setJobId(null);
    setSelectedFmt(null);
    analyze(url);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center px-4 py-16 gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Video Downloader</h1>
        <p className="text-zinc-500 text-sm mt-2">1,000+ supported platforms</p>
      </div>
      <URLInput onAnalyze={handleAnalyze} loading={analyzing} />
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {info && (
        <>
          <VideoCard info={info} />
          <FormatGrid formats={info.formats} selected={selectedFmt} onSelect={setSelectedFmt} />
          {!jobId && (
            <DownloadButton
              url={currentURL}
              formatId={selectedFmt}
              onJobStart={setJobId}
            />
          )}
        </>
      )}
      {job && <ProgressPanel job={job} />}
      {job?.status === 'done' && job?.download_token && (
        
          href={getDownloadURL(jobId, job.download_token)}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full max-w-2xl bg-green-600 hover:bg-green-500 text-white font-semibold py-3 rounded-xl transition-colors text-center block"
        >
          ✓ Tap here to save your file
        </a>
      )}
    </div>
  );
}
