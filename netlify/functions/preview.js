exports.handler = async (event) => {
  if (event.httpMethod !== 'POST')
    return { statusCode: 405, body: 'Method Not Allowed' };

  const { url } = JSON.parse(event.body || '{}');
  if (!url)
    return { statusCode: 400, body: JSON.stringify({ thumbnail: null, title: null }) };

  try {
    // Twitter/X — use public oEmbed endpoint
    if (/twitter\.com|x\.com/.test(url)) {
      const res = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`
      );
      if (res.ok) {
        const data = await res.json();
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            thumbnail: data.thumbnail_url ?? null,
            title:     data.author_name ? `@${data.author_name}` : 'X / Twitter',
          }),
        };
      }
    }

    // Facebook / Instagram — scrape Open Graph tags
    const res = await fetch(url, {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
    });

    if (!res.ok) throw new Error('fetch failed');
    const html = await res.text();

    const thumb = (
      html.match(/property="og:image"\s+content="([^"]+)"/) ||
      html.match(/content="([^"]+)"\s+property="og:image"/)
    )?.[1] ?? null;

    const title = (
      html.match(/property="og:title"\s+content="([^"]+)"/) ||
      html.match(/content="([^"]+)"\s+property="og:title"/)
    )?.[1] ?? null;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thumbnail: thumb, title }),
    };

  } catch {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ thumbnail: null, title: null }),
    };
  }
};
