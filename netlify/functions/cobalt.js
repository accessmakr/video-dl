const COBALT_URL = process.env.COBALT_URL;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  if (!COBALT_URL)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { code: 'server.cobalt_url.missing' } }),
    };

  try {
    const res = await fetch(`${COBALT_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept':       'application/json',
      },
      body: event.body,
    });
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: await res.text(),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { code: 'proxy.error', context: { message: e.message } } }),
    };
  }
};
