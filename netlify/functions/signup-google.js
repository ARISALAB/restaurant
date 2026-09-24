const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { slugify, notifyOwner } = require('./_shared/signup');
const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;


exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const db = getDb();
  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return json(401, { error: 'no_token' });

  let caller;
  try { caller = await admin.auth().verifyIdToken(h.slice(7)); }
  catch { return json(401, { error: 'invalid_token' }); }

  if (caller.firebase?.sign_in_provider !== 'google.com' || !caller.email_verified || !caller.email)
    return json(403, { error: 'google_only' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }
  const shopName = String(b.shopName || '').trim();
  const phone    = String(b.phone || '').trim().slice(0, 30);
  const type     = String(b.type || '').trim().slice(0, 40);
  const plan     = String(b.plan || '').trim().slice(0, 60);
  const lang     = b.lang === 'en' ? 'en' : 'el';
  const email    = caller.email.toLowerCase();

  if (!shopName)             return json(400, { error: 'missing_fields' });
  if (shopName.length > 80)  return json(400, { error: 'name_too_long' });
  if (b.acceptTerms !== true) return json(400, { error: 'terms_required' });

  // Ένας λογαριασμός = ένα κατάστημα
  if ((await db.ref(`users_to_shops/${caller.uid}`).get()).exists())
    return json(409, { error: 'already_has_shop' });

  const base = slugify(shopName);
  let shopId = null;
  for (let i = 1; i <= 50; i++) {
    const c = i === 1 ? base : `${base}_${i}`;
    if (!(await db.ref(`shop_details/${c}`).get()).exists()) { shopId = c; break; }
  }
  if (!shopId) return json(409, { error: 'shop_exists' });

  const now = Date.now();
  try {
    await db.ref().update({
      [`users_to_shops/${caller.uid}`]: shopId,
      [`shop_details/${shopId}`]: {
        displayName: shopName, email, status: 'active', source: 'google',
        createdAt: now, activatedAt: now, termsAcceptedAt: now, lang, phone, type, plan,
        paidUntil: now + TRIAL_MS, billingStatus: 'trial'
      },
      [`shop_profile/${shopId}/info/notificationEmail`]: email
    });
  } catch (e) {
    console.error('db write failed', e);
    return json(500, { error: 'db_write_failed' });
  }

  try { await notifyOwner({ shopId, shopName, email, phone, type, plan, status: 'ενεργό, εγγραφή με Google' }); }
  catch (e) { console.error('owner notify failed', e); }

  return json(200, { ok: true, shopId });
};
