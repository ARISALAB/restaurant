const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { sendVerificationEmail, ADMIN_URL } = require('./_shared/signup');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const db = getDb();
  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return json(401, { error: 'no_token' });

  let caller;
  try { caller = await admin.auth().verifyIdToken(h.slice(7)); }
  catch { return json(401, { error: 'invalid_token' }); }

  const user = await admin.auth().getUser(caller.uid);
  if (user.emailVerified) return json(200, { ok: true, alreadyVerified: true });

  // Όχι πάνω από ένα email το λεπτό
  const metaRef = db.ref(`signup_meta/${caller.uid}/lastVerifySent`);
  const last = (await metaRef.get()).val() || 0;
  if (Date.now() - last < 60 * 1000) return json(429, { error: 'too_soon' });

  const shopId = (await db.ref(`users_to_shops/${caller.uid}`).get()).val();
  const details = shopId ? (await db.ref(`shop_details/${shopId}`).get()).val() || {} : {};

  try {
    const link = await admin.auth().generateEmailVerificationLink(user.email, { url: ADMIN_URL });
    await sendVerificationEmail({ to: user.email, shopName: details.displayName || user.displayName || '', link, lang: details.lang || 'el' });
    await metaRef.set(Date.now());
  } catch (e) {
    console.error('resend verification failed', e);
    return json(500, { error: 'send_failed', detail: e.code || e.message || String(e) });
  }
  return json(200, { ok: true });
};
