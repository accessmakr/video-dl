// Hardcoded fallback so it works even without the env var being set
const COBALT_URL = import.meta.env.VITE_COBALT_URL ?? 'https://videodl-backend.onrender.com';

export async function getDownloadLink(url, videoQuality, audioOnly) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 45000); // 45s for slow platforms

  try {
    const res = await fetch(`${COBALT_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: JSON.stringify({
        url,
        videoQuality,
        downloadMode:  audioOnly ? 'audio' : 'auto',
        filenameStyle: 'pretty',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    if (!res.ok || data.status === 'error') {
      throw new Error(data.error?.code ?? 'Unknown error');
    }

    return data;

  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') throw new Error('Request timed out — try again');
    throw e;
  }
}
