const BACKEND = process.env.BACKEND_URL;
const API_KEY  = process.env.API_KEY;

exports.handler = async (event) => {
  const jobId = event.path.split('/').pop();

  try {
    const res = await fetch(`${BACKEND}/status/${jobId}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: await res.text(),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ detail: e.message }) };
  }
};
