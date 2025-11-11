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

  // -------- helpers --------
  const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';

  async function fetchFollowWithCookies(startUrl, rangeHeader) {
    let url = startUrl;
    let cookie = '';                 // cookie jar (single header)
    let refererForHost = startUrl;   // נשתמש ברפרר המלא של ה-URL הראשון
    for (let i = 0; i < 8; i++) {    // הגבלת redirect-ים
      const r = await fetch(url, {
        redirect: 'manual',          // אנחנו מנהלים redirect ידנית
        headers: {
          'User-Agent': UA,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
          'Referer': refererForHost,
          ...(cookie ? { 'Cookie': cookie } : {}),
          ...(rangeHeader ? { 'Range': rangeHeader } : {}),
        },
      });

      // צבירת cookies
      const setCookie = r.headers.get('set-cookie');
      if (setCookie) {
        // אם כבר יש cookie – מחברים; אחרת מאפסים
        cookie = cookie
          ? cookie + '; ' + setCookie.split(';')[0]
          : setCookie.split(';')[0];
      }

      // redirect ידני
      if ([301,302,303,307,308].includes(r.status)) {
        const loc = r.headers.get('location');
        if (!loc) return { response: r, finalUrl: url, cookie };
        const next = new URL(loc, url).toString();
        url = next;
        // מעדכנים referer להתנהגות דפדפן רגילה (רפרר של הדף הקודם)
        refererForHost = new URL(url).origin + '/';
        continue;
      }

      return { response: r, finalUrl: url, cookie };
    }
    throw new Error('Too many redirects');
  }

  try {
    const range = req.headers.range;
    const { response: upstream, finalUrl, cookie } =
      await fetchFollowWithCookies(u, range);

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

    // אם זה m3u8 – שכתוב לכל ה-URI-ים בפנים בחזרה דרך הפרוקסי
    if (isM3U8) {
      const text = await upstream.text();
      const base = new URL(finalUrl);
      const self = new URL(req.url, `https://${req.headers.host}`);
      self.search = ''; // נבנה מחדש

      const rewritten = text.split(/\r?\n/).map(line => {
        if (!line || line.startsWith('#')) return line;
        try {
          const abs = new URL(line, base).toString();
          return `${self.toString()}?u=${encodeURIComponent(abs)}`;
        } catch { return line; }
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      // כדי שהבקשות הבאות (סגמנטים) יישאו cookie – נעביר אותו בשקוף דרך הפרוקסי:
      if (cookie) res.setHeader('Set-Cookie', cookie + '; Path=/; SameSite=None; Secure');
      return res.status(upstream.status).send(rewritten);
    }

    // קטעי וידאו/מפתחות – העברה גולמית עם כותרות מתאימות
    if (ct) res.setHeader('Content-Type', ct);
    const cl = upstream.headers.get('content-length'); if (cl) res.setHeader('Content-Length', cl);
    const cr = upstream.headers.get('content-range');  if (cr) res.setHeader('Content-Range', cr);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');

    // העברת גוף
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.status(upstream.status).send(buf);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(500).send('Proxy error: ' + (e?.message || String(e)));
  }
};
