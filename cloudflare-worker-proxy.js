// Zenith SX v29.0 — Private Zero-Cost Cloudflare Worker Market Proxy
// Deploy in 60 seconds at https://dash.cloudflare.com -> Workers -> Create Worker
// Then paste your Worker URL into Zenith SX Settings -> Custom Private Market Proxy
export default {
  async fetch(request) {
    const urlObj = new URL(request.url);
    const target = urlObj.searchParams.get('url');
    if (!target || (!target.startsWith('https://query1.finance.yahoo.com/') && !target.startsWith('https://www.google.com/finance/'))) {
      return new Response('Forbidden target', { status: 403 });
    }
    const resp = await fetch(target, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        'Content-Type': resp.headers.get('Content-Type') || 'text/plain',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=10'
      }
    });
  }
};
