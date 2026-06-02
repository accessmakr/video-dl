/**
 * netlify/functions/convert-status.js
 * Proxy for GET /api/convert/status/:jobId
 * Polls the converter backend for job status and returns it to the frontend.
 */

const CONVERTER_URL = process.env.CONVERTER_URL;

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET')
    return { statusCode: 405, body: 'Method Not Allowed' };

  if (!CONVERTER_URL)
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Converter service not configured.' }),
    };

  // Extract jobId from path: /api/convert/status/JOB_ID
  const parts = event.path.split('/');
  const jobId = parts[parts.length - 1];

  if (!jobId || jobId === 'status')
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing jobId.' }),
    };

  try {
    const res  = await fetch(`${CONVERTER_URL}/jobs/${jobId}`);
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
