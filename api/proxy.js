// Vercel Serverless (Node.js) – CommonJS
module.exports = async function (req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  const u = req.query.u;
  if (!u) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).send('Missing ?u=');
  }

  try {
    const target = new URL(u);
    const upstream = await fetch(u, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
        // חשוב: רק Referer, בלי Origin
        'Referer': 'https://www.xlrod.com/',
        'Host': target.hostname,
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      }
    });

    const ct = upstream.headers.get('content-type') || '';
    const isM3U8 = ct.includes('application/vnd.apple.mpegurl')
                || ct.includes('audio/mpegurl')
                || ct.includes('application/x-mpegURL')
                || new URL(upstream.url).pathname.endsWith('.m3u8');

    // CORS כללי
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (isM3U8) {
      const text = await upstream.text();
      const base = new URL(upstream.url);
      const self = new URL(req.url, `https://${req.headers.host}`); self.search = '';

      const rewritten = text.split(/\r?\n/).map(line => {
        if (!line || line.startsWith('#')) return line;
        try { return `${self.toString()}?u=${encodeURIComponent(new URL(line, base).href)}`; }
        catch { return line; }
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.status(upstream.status).send(rewritten);
    }

    if (ct) res.setHeader('Content-Type', ct);
    const cl = upstream.headers.get('content-length'); if (cl) res.setHeader('Content-Length', cl);
    const cr = upstream.headers.get('content-range');  if (cr) res.setHeader('Content-Range', cr);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(buf);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).send('Proxy error: ' + (e?.message || String(e)));
  }
};
