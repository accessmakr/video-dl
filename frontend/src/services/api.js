export async function getPreview(url) {
  try {
    const res = await fetch('/api/preview', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url }),
    });
    if (!res.ok) return { thumbnail: null, title: null };
    return res.json();
  } catch {
    return { thumbnail: null, title: null };
  }
}

export async function getDownloadLink(url, videoQuality) {
  const res = await fetch('/api/cobalt', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      url,
      videoQuality,
      downloadMode:  'auto',
      filenameStyle: 'pretty',
    }),
  });

  const data = await res.json();

  if (!res.ok || data.status === 'error') {
    throw new Error(data.error?.code ?? 'Unknown error');
  }

  return data;
}
