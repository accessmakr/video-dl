export async function getDownloadLink(url, videoQuality, audioOnly) {
  const res = await fetch('/api/cobalt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url,
      videoQuality,
      downloadMode:  audioOnly ? 'audio' : 'auto',
      filenameStyle: 'pretty',
    }),
  });

  const data = await res.json();

  if (!res.ok || data.status === 'error') {
    throw new Error(data.error?.code ?? 'Unknown error');
  }

  return data;
}
