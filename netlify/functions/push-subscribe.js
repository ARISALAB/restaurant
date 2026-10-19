// Ειδοποίηση στο κινητό του πελάτη (web push) για μια κράτηση.
// GET  -> { publicKey }                         (το δημόσιο κλειδί VAPID για τον browser)
// POST { shop, id, t, sub:{endpoint,keys:{p256dh,auth}} } -> { ok:true }
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  const publicKey = process.env.VAPID_PUBLIC_KEY || '';

  if (event.httpMethod === 'GET') {
    if (!publicKey) return json(503, { error: 'push_not_configured' });
    return json(200, { publicKey });
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!publicKey || !process.env.VAPID_PRIVATE_KEY) return json(503, { error: 'push_not_configured' });

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'bad_request' }); }
  const shop = String(p.shop || ''), id = String(p.id || ''), token = String(p.t || '');
  const sub = p.sub || {}, keys = sub.keys || {};
  const endpoint = String(sub.endpoint || '');
  if (!/^[a-z0-9_]{1,60}$/.test(shop) || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || !token ||
      !/^https:\/\/[^\s]{10,600}$/.test(endpoint) ||
      typeof keys.p256dh !== 'string' || keys.p256dh.length > 200 ||
      typeof keys.auth !== 'string' || keys.auth.length > 100) {
    return json(400, { error: 'bad_request' });
  }

  try {
    const db = getDb();
    const ref = db.ref(`reservations/${shop}/${id}`);
    const b = (await ref.get()).val();
    if (!b || b.cancelToken !== token) return json(404, { error: 'not_found' });
    if (b.status === 'cancelled') return json(410, { error: 'cancelled' });
    await ref.child('push').set({ endpoint, p256dh: keys.p256dh, auth: keys.auth });
    return json(200, { ok: true });
  } catch (e) {
    console.error('[push-subscribe] error:', e);
    return json(500, { error: 'server_error' });
  }
};
