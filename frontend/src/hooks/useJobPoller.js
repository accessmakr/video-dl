import { useState, useEffect, useRef } from 'react';
import { getStatus } from '../services/api';

export function useJobPoller(jobId) {
  const [job, setJob] = useState(null);
  const timerRef      = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    const start = Date.now();
    const TIMEOUT_MS = 3 * 60 * 1000;

    const poll = async () => {
      try {
        const data = await getStatus(jobId);
        setJob(data);
        if (data.status === 'done' || data.status === 'error') return;
        if (Date.now() - start > TIMEOUT_MS) {
          setJob((prev) => ({ ...prev, status: 'error', error: 'Timed out' }));
          return;
        }
        timerRef.current = setTimeout(poll, 1000);
      } catch (e) {
        setJob({ status: 'error', error: e.message });
      }
    };

    poll();
    return () => clearTimeout(timerRef.current);
  }, [jobId]);

  return job;
}
