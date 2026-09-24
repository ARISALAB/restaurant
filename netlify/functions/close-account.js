// Κλείσιμο λογαριασμού από τον ιδιοκτήτη. Τα δεδομένα διαγράφονται οριστικά 30 ημέρες μετά (purge-closed).
const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const db = getDb();
  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return json(401, { error: 'no_token' });

  let caller;
  try { caller = await admin.auth().verifyIdToken(h.slice(7), true); }
  catch { return json(401, { error: 'invalid_token' }); }

  // Επιβεβαίωση ότι πρόσφατα συνδέθηκε (τελευταία 10 λεπτά)
  if (Date.now() / 1000 - (caller.auth_time || 0) > 10 * 60) return json(401, { error: 'reauth_required' });

  const shopId = (await db.ref(`users_to_shops/${caller.uid}`).get()).val();
  if (!shopId) return json(404, { error: 'no_shop' });

  const detRef = db.ref(`shop_details/${shopId}`);
  const det = (await detRef.get()).val() || {};
  const now = Date.now();

  // Αν υπάρχει συνδρομή στο Lemon Squeezy, την ακυρώνουμε (αν έχει οριστεί API key)
  let subscriptionCancelled = false;
  if (det.lemonSubscriptionId && process.env.LEMON_API_KEY) {
    try {
      const r = await fetch(`https://api.lemonsqueezy.com/v1/subscriptions/${det.lemonSubscriptionId}`, {
        method: 'DELETE',
        headers: { 'Accept': 'application/vnd.api+json', 'Authorization': `Bearer ${process.env.LEMON_API_KEY}` }
      });
      subscriptionCancelled = r.ok;
      if (!r.ok) console.error('lemon cancel failed', r.status, await r.text());
    } catch (e) { console.error('lemon cancel error', e); }
  }

  await detRef.update({ status: 'closed', closedAt: now, deleteAfter: now + RETENTION_MS, closedBy: 'owner' });
  console.log('shop closed', shopId, 'subscriptionCancelled', subscriptionCancelled);
  return json(200, { ok: true, deleteAfter: now + RETENTION_MS, subscriptionCancelled });
};
