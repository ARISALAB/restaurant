const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const db = getDb();
  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return json(401, { error: 'no_token' });

  let caller;
  try { caller = await admin.auth().verifyIdToken(h.slice(7)); }
  catch { return json(401, { error: 'invalid_token' }); }

  // Ελέγχουμε απευθείας στο Firebase, όχι μόνο στο token
  const user = await admin.auth().getUser(caller.uid);
  if (!user.emailVerified) return json(403, { error: 'not_verified' });

  const shopId = (await db.ref(`users_to_shops/${caller.uid}`).get()).val();
  if (!shopId) return json(404, { error: 'no_shop' });

  const statusRef = db.ref(`shop_details/${shopId}/status`);
  if ((await statusRef.get()).val() === 'pending') {
    await db.ref(`shop_details/${shopId}`).update({ status: 'active', activatedAt: Date.now() });
  }
  return json(200, { ok: true, shopId });
};
