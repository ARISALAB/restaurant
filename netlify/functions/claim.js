// Ενεργοποίηση προσχεδίου από τον ιδιοκτήτη (πιλοτικό: 6 μήνες δωρεάν, χωρίς κάρτα).
//
// POST /.netlify/functions/claim
//   Με email:  { shop, token, email, password, phone?, acceptTerms:true, lang?, tz? }
//              -> λογαριασμός, κατάστημα "pending" μέχρι να επιβεβαιωθεί το email (όπως η κανονική εγγραφή)
//   Με Google: Authorization: Bearer <idToken Google>, { shop, token, phone?, acceptTerms:true, lang?, tz? }
//              -> το κατάστημα ενεργοποιείται αμέσως
// ->  200 { ok:true, shopId, slug, status }   |   4xx { error }

const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { normLang } = require('./_shared/i18n');
const { validTz } = require('./_shared/time');
const { sendVerificationEmail, notifyOwner, ADMIN_URL } = require('./_shared/signup');
const { termsFields, logTerms } = require('./_shared/terms');

const PILOT_MS = 183 * 24 * 60 * 60 * 1000;   // 6 μήνες

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }
  if (b.website) return json(200, { ok: true });   // παγίδα για bots

  const shop  = String(b.shop || '').trim();
  const token = String(b.token || '').trim();
  const phone = String(b.phone || '').trim().slice(0, 30);
  const lang  = normLang(b.lang);
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(shop) || !token) return json(400, { error: 'bad_request' });
  if (b.acceptTerms !== true) return json(400, { error: 'terms_required' });

  const db = getDb();
  const details = (await db.ref(`shop_details/${shop}`).get()).val();
  if (!details || details.status !== 'draft') return json(404, { error: 'invalid_link' });
  const shopName = details.displayName || shop;

  // Ποιος ενεργοποιεί
  const h = event.headers.authorization || event.headers.Authorization || '';
  const viaGoogle = h.startsWith('Bearer ');
  let uid, email, created = false;
  if (viaGoogle) {
    let caller;
    try { caller = await admin.auth().verifyIdToken(h.slice(7)); }
    catch { return json(401, { error: 'invalid_token' }); }
    if (caller.firebase?.sign_in_provider !== 'google.com' || !caller.email_verified || !caller.email)
      return json(403, { error: 'google_only' });
    uid = caller.uid; email = caller.email.toLowerCase();
    if ((await db.ref(`users_to_shops/${uid}`).get()).exists()) return json(409, { error: 'already_has_shop' });
  } else {
    email = String(b.email || '').trim().toLowerCase();
    const password = String(b.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'invalid_email' });
    if (password.length < 8) return json(400, { error: 'weak_password' });
    // Πρώτα ελέγχουμε το link, για να μη φτιαχτεί λογαριασμός με λάθος link
    const cur = (await db.ref(`drafts/${shop}/token`).get()).val();
    if (cur !== token) return json(404, { error: 'invalid_link' });
    try {
      const u = await admin.auth().createUser({ email, password, displayName: shopName, emailVerified: false });
      uid = u.uid; created = true;
    } catch (e) {
      if (e.code === 'auth/email-already-exists') return json(409, { error: 'email_in_use' });
      if (e.code === 'auth/invalid-email')        return json(400, { error: 'invalid_email' });
      if (e.code === 'auth/invalid-password')     return json(400, { error: 'weak_password' });
      console.error('[claim] createUser failed', e);
      return json(500, { error: 'create_user_failed' });
    }
  }

  // Το link ισχύει μόνο μία φορά: το «καίμε» ατομικά πριν δώσουμε το κατάστημα
  const tx = await db.ref(`drafts/${shop}/token`).transaction(cur => (cur === token ? null : undefined));
  if (!tx.committed) {
    if (created) await admin.auth().deleteUser(uid).catch(() => {});
    return json(404, { error: 'invalid_link' });
  }

  const now = Date.now();
  const status = viaGoogle ? 'active' : 'pending';
  const terms = termsFields(event, uid, viaGoogle ? 'claim-google' : 'claim', now);
  const upd = {
    [`users_to_shops/${uid}`]: shop,
    [`shop_details/${shop}/email`]: email,
    [`shop_details/${shop}/status`]: status,
    [`shop_details/${shop}/source`]: 'draft',
    [`shop_details/${shop}/claimedAt`]: now,
    [`shop_details/${shop}/lang`]: lang,
    [`shop_details/${shop}/paidUntil`]: now + PILOT_MS,
    [`shop_details/${shop}/billingStatus`]: 'trial',
    [`shop_details/${shop}/pilot`]: true,
    [`shop_profile/${shop}/info/notificationEmail`]: email,
    [`drafts/${shop}/claimedAt`]: now,
    [`drafts/${shop}/claimedBy`]: email,
  };
  if (viaGoogle) upd[`shop_details/${shop}/activatedAt`] = now;
  else upd[`signup_meta/${uid}/lastVerifySent`] = now;
  if (phone) upd[`shop_details/${shop}/phone`] = phone;
  if (validTz(b.tz)) upd[`shop_profile/${shop}/info/tz`] = b.tz;
  for (const [k, v] of Object.entries(terms)) upd[`shop_details/${shop}/${k}`] = v;

  try {
    await db.ref().update(upd);
  } catch (e) {
    console.error('[claim] db write failed', e);
    await db.ref(`drafts/${shop}/token`).set(token).catch(() => {});   // το link ξαναγίνεται έγκυρο
    if (created) await admin.auth().deleteUser(uid).catch(() => {});
    return json(500, { error: 'db_write_failed' });
  }

  await logTerms(db, shop, terms).catch(e => console.error('[claim] terms log failed', e));

  if (!viaGoogle) {
    try {
      const link = await admin.auth().generateEmailVerificationLink(email, { url: ADMIN_URL });
      await sendVerificationEmail({ to: email, shopName, link, lang });
    } catch (e) { console.error('[claim] verification email failed', e); }
  }
  try {
    await notifyOwner({ shopId: shop, shopName, email, phone, type: 'πιλοτικό', plan: '6 μήνες δωρεάν',
      status: viaGoogle ? 'ενεργοποιήθηκε από προσχέδιο (Google)' : 'ενεργοποίηση από προσχέδιο, αναμονή επιβεβαίωσης email' });
  } catch (e) { console.error('[claim] owner notify failed', e); }

  return json(200, { ok: true, shopId: shop, slug: details.slug || null, status });
};
