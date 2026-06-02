/**
 * netlify/functions/convert-job.js
 * Proxy for POST /api/convert/job
 * Creates a new audio conversion job on the converter backend.
 * For URL-based jobs: proxies the full request.
 * For file uploads > 6 MB: frontend calls converter directly (VITE_CONVERTER_URL).
 */

const CONVERTER_URL = process.env.CONVERTER_URL;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  if (!CONVERTER_URL)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Converter service not configured.' }),
    };

  try {
    const res = await fetch(`${CONVERTER_URL}/jobs`, {
      method:  'POST',
      headers: {
        'Content-Type': event.headers['content-type'] || 'application/json',
      },
      body: event.body,
    });

    const text = await res.text();
    return {
      statusCode: res.status,
      headers: { 'Content-Type': 'application/json' },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Converter unreachable: ${err.message}` }),
    };
  }
};
