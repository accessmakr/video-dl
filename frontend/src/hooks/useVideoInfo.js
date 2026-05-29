import { useState, useCallback } from 'react';
import { analyzeVideo } from '../services/api';

export function useVideoInfo() {
  const [info, setInfo]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const analyze = useCallback(async (url) => {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const data = await analyzeVideo(url);
      setInfo(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  return { info, loading, error, analyze };
}
