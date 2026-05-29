const BACKEND = process.env.BACKEND_URL;
const API_KEY  = process.env.API_KEY;

exports.handler = async (event) => {
  const parts = event.path.split('/');
  const jobId = parts[parts.length - 1];

  try {
    const check = await fetch(`${BACKEND}/status/${jobId}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    const job = await check.json();
    if (job.status !== 'done')
      return { statusCode: 400, body: JSON.stringify({ detail: 'Not ready' }) };

    const direct = `${BACKEND}/file/${jobId}?token=${job.download_token}`;
    return { statusCode: 302, headers: { Location: direct }, body: '' };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ detail: e.message }) };
  }
};
