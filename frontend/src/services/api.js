const BASE = import.meta.env.VITE_API_BASE ?? '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? 'Request failed');
  }
  return res.json();
}

export const analyzeVideo = (url) =>
  request('/analyze', { method: 'POST', body: JSON.stringify({ url }) });

export const startDownload = (url, format_id) =>
  request('/download', { method: 'POST', body: JSON.stringify({ url, format_id }) });

export const getStatus = (jobId) =>
  request(`/status/${jobId}`);

export const getDownloadURL = (jobId, token) =>
  `${import.meta.env.VITE_BACKEND_DIRECT ?? ''}/file/${jobId}?token=${token}`;
