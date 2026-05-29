const BACKEND = process.env.BACKEND_URL;
const API_KEY  = process.env.API_KEY;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  try {
    const res = await fetch(`${BACKEND}/download`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: event.body,
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
