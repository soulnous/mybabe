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

  const startUrl = req.query.u;
  if (!startUrl) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(400).send('Missing ?u=');
  }

  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

  // נעקוב אחרי Redirect-ים ידנית + ננהל Cookie Jar
  async function fetchFollowWithCookies(url, rangeHeader) {
    let cur = startUrl;
    let cookie = '';
    for (let hop = 0; hop < 10; hop++) {
      const host = new URL(cur).hostname;

      const r = await fetch(cur, {
        redirect: 'manual',
        headers: {
          // headers "דפדפן"
          'User-Agent': UA,
          'Accept':
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Upgrade-Insecure-Requests': '1',

          // הכי חשובים אצלם:
          'Referer': 'https://www.xlrod.com/',
          'Host': host,

          // שמירה על טווח לסגמנטים
          ...(rangeHeader ? { 'Range': rangeHeader } : {}),
          ...(cookie ? { 'Cookie': cookie } : {}),

          // חלק מאתרים אוהבים את אלה:
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Dest': 'document',
        },
      });

      // איסוף cookies
      const setCookieAll = r.headers.get('set-cookie');
      if (setCookieAll) {
        // שומרים רק שם=ערך, בלי מאפיינים
        const parts = setCookieAll.split(/,(?=[^;]+?=)/); // מפרק אם יש כמה Set-Cookie בשורה
        for (const p of parts) {
          const kv = p.split(';')[0].trim();
          if (!cookie.includes(kv.split('=')[0] + '=')) {
            cookie = cookie ? cookie + '; ' + kv : kv;
          }
        }
      }

      // Redirect ידני
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const loc = r.headers.get('location');
        if (!loc) return { response: r, finalUrl: cur, cookie };
        cur = new URL(loc, cur).toString();
        continue;
      }

      return { response: r, finalUrl: cur, cookie };
    }
    throw new Error('Too many redirects');
  }

  try {
    const range = req.headers.range;
    const { response: upstream, finalUrl, cookie } =
      await fetchFollowWithCookies(startUrl, range);

    // כותרות תשובה כלליות
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const ct = upstream.headers.get('content-type') || '';
    const isM3U8 =
      ct.includes('application/vnd.apple.mpegurl') ||
      ct.includes('audio/mpegurl') ||
      ct.includes('application/x-mpegURL') ||
      new URL(finalUrl).pathname.endsWith('.m3u8');

    if (isM3U8) {
      const text = await upstream.text();
      const base = new URL(finalUrl);

      // בניית self URL (אותו endpoint) כדי שכל ה-URI-ים בפנים יחזרו דרך הפרוקסי
      const self = new URL(req.url, `https://${req.headers.host}`);
      self.search = '';

      const rewritten = text
        .split(/\r?\n/)
        .map((line) => {
          if (!line || line.startsWith('#')) return line;
          try {
            const abs = new URL(line, base).toString();
            return `${self.toString()}?u=${encodeURIComponent(abs)}`;
          } catch {
            return line;
          }
        })
        .join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      if (cookie) {
        // מאפשר ללקוח לשמר cookie בין הבקשות (לא קריטי, אבל לפעמים מועיל)
        res.setHeader(
          'Set-Cookie',
          `${cookie}; Path=/; SameSite=None; Secure`
        );
      }
      return res.status(upstream.status).send(rewritten);
    }

    // קטעי וידאו/מפתחות – העברה גולמית
    if (ct) res.setHeader('Content-Type', ct);
    const cl = upstream.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    const cr = upstream.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');

    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(buf);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).send('Proxy error: ' + (e?.message || String(e)));
  }
};
