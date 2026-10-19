// Λίστα αναμονής.
// POST { action:"join", shop, date, time ("20:30"|"any"), guests, name, phone, email, lang, website }  -> { ok:true }
// POST { action:"freed", shop, date, time }  + Authorization: Bearer <Firebase ID token του καταστήματος>
//      (το admin το καλεί όταν ακυρώνει ή διαγράφει κράτηση)                                         -> { ok:true, notified }
const crypto = require('crypto');
const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { athensDay } = require('./_shared/time');
const { notifyWaitlist, phoneKey, notifyShopJoin } = require('./_shared/waitlist');

const SUPER_UID = 'cGhWqj5Mtiey6AC8CMpiUZDxAGh1';
const MAX_PER_DAY = 200;
const str = (v, max) => (typeof v === 'string' ? v.trim() : '').slice(0, max);

async function rateLimited(db, event) {
  const h = event.headers || {};
  const ip = h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim();
  if (!ip) return false;
  const key = crypto.createHash('sha256').update('wl:' + ip).digest('hex').slice(0, 32);
  const now = Date.now();
  const r = await db.ref(`booking_rate/${key}`).transaction(cur => {
    if (!cur || now - cur.start > 10 * 60 * 1000) return { start: now, n: 1 };
    if (cur.n >= 6) return;
    return { start: cur.start, n: cur.n + 1 };
  });
  return !r.committed;
}

async function join(db, b, event) {
  if (b.website) return json(200, { ok: true });
  const shop = String(b.shop || '').toLowerCase();
  const date = String(b.date || ''), time = String(b.time || '');
  const guests = parseInt(b.guests, 10);
  const name = str(b.name, 100), phone = str(b.phone, 30), email = str(b.email, 120);
  const lang = b.lang === 'en' ? 'en' : 'el';
  if (!/^[a-z0-9_]{1,60}$/.test(shop) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(time === 'any' || /^\d{2}:\d{2}$/.test(time)) ||
      !(guests >= 1 && guests <= 50) || !name || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'bad_request' });
  }
  const today = athensDay(Date.now());
  if (date < today || date > athensDay(Date.now() + 400 * 86400000)) return json(400, { error: 'bad_time' });

  const [details, capacity] = await Promise.all([
    db.ref(`shop_details/${shop}`).get().then(s => s.val()),
    db.ref(`shop_profile/${shop}/info/capacity`).get().then(s => s.val()),
  ]);
  if (!details || details.status === 'pending' || details.status === 'closed' || (details.paidUntil && details.paidUntil < Date.now())) {
    return json(403, { error: 'shop_inactive' });
  }
  if (typeof capacity !== 'number' || capacity <= 0) return json(400, { error: 'no_waitlist' });
  if (await rateLimited(db, event)) return json(429, { error: 'rate_limited' });

  const dayRef = db.ref(`waitlist/${shop}/${date}`);
  const existing = (await dayRef.get()).val() || {};
  if (Object.keys(existing).length >= MAX_PER_DAY) return json(409, { error: 'waitlist_full' });

  // Ίδιος πελάτης την ίδια μέρα: ενημερώνουμε την εγγραφή του αντί για διπλή
  const key = phoneKey(phone);
  const dup = Object.entries(existing).find(([, e]) => e && phoneKey(e.phone) === key);
  // «Οποιαδήποτε ώρα» = μία από τις ώρες που ήταν πλήρεις τη στιγμή της εγγραφής
  const times = time === 'any' && Array.isArray(b.times)
    ? [...new Set(b.times.map(String).filter(x => /^\d{2}:\d{2}$/.test(x)))].slice(0, 48) : null;
  const entry = { name, phone, email, time, guests, lang, status: 'waiting', createdAt: dup ? (dup[1].createdAt || Date.now()) : Date.now() };
  if (times && times.length) entry.times = times;
  if (dup) await dayRef.child(dup[0]).set(entry);
  else await dayRef.push(entry);
  console.log('[waitlist] join', shop, date, time, guests, dup ? '(updated)' : '(new)');
  await notifyShopJoin(db, shop, entry, date, !!dup).catch(e => console.error('[waitlist] shop email', e.message));
  return json(200, { ok: true });
}

async function freed(db, b, event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'no_token' });
  let caller;
  try { caller = await admin.auth().verifyIdToken(auth.slice(7)); } catch (e) { return json(401, { error: 'invalid_token' }); }
  const shop = String(b.shop || '');
  const own = (await db.ref(`users_to_shops/${caller.uid}`).get()).val();
  if (own !== shop && caller.uid !== SUPER_UID) return json(403, { error: 'forbidden' });
  const notified = await notifyWaitlist(db, shop, String(b.date || ''), String(b.time || ''));
  return json(200, { ok: true, notified });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });
  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'bad_request' }); }
  try {
    const db = getDb();
    if (b.action === 'join') return await join(db, b, event);
    if (b.action === 'freed') return await freed(db, b, event);
    return json(400, { error: 'bad_request' });
  } catch (e) {
    console.error('[waitlist] error:', e);
    return json(500, { error: 'server_error' });
  }
};
