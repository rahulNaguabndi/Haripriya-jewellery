import crypto from 'crypto';

// Guards scheduled machine-to-machine routes (the nightly digest GitHub
// Action) that have no user session. The caller sends the shared secret as
// `X-Cron-Key`, matched against CRON_SECRET. Fails closed: with no secret
// configured on the server every request is rejected.
export function requireCronKey(req, res, next) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return res.status(503).json({ error: 'Cron key not configured' });

  const a = Buffer.from(String(req.headers['x-cron-key'] || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Invalid cron key' });
  }
  next();
}
