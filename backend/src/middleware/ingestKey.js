import crypto from 'crypto';

// Guards machine-to-machine ingest routes (e.g. the price-scraper GitHub
// Action) that have no Supabase user session. The caller must send the shared
// secret as `X-Ingest-Key`, matched against PRICE_INGEST_KEY. Fails closed:
// if the server has no key configured, every request is rejected.
export function requireIngestKey(req, res, next) {
  const expected = process.env.PRICE_INGEST_KEY;
  if (!expected) {
    return res.status(503).json({ error: 'Ingest key not configured' });
  }

  const provided = req.headers['x-ingest-key'] || '';
  const a = Buffer.from(String(provided));
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so length-check first.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid ingest key' });
  }
  next();
}
