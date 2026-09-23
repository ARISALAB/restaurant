const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { slugify, sendVerificationEmail, notifyOwner, ADMIN_URL } = require('./_shared/signup');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }

  // Παγίδα για bots: κρυφό πεδίο που οι άνθρωποι δεν βλέπουν
  if (b.website) return json(200, { ok: true });

  const shopName = String(b.shopName || '').trim();
  const email    = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const phone    = String(b.phone || '').trim().slice(0, 30);
  const type     = String(b.type || '').trim().slice(0, 40);
  const plan     = String(b.plan || '').trim().slice(0, 60);
  const lang     = b.lang === 'en' ? 'en' : 'el';

  if (!shopName || !email || !password)       return json(400, { error: 'missing_fields' });
  if (b.acceptTerms !== true)                  return json(400, { error: 'terms_required' });
  if (shopName.length > 80)                    return json(400, { error: 'name_too_long' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { error: 'invalid_email' });
  if (password.length < 8)                     return json(400, { error: 'weak_password' });

  const db = getDb();

  // Μοναδικό ID καταστήματος από το όνομα
  const base = slugify(shopName);
  let shopId = null;
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? base : `${base}_${i}`;
    if (!(await db.ref(`shop_details/${candidate}`).get()).exists()) { shopId = candidate; break; }
  }
  if (!shopId) return json(409, { error: 'shop_exists' });

  // Λογαριασμός
  let user;
  try {
    user = await admin.auth().createUser({ email, password, displayName: shopName, emailVerified: false });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') return json(409, { error: 'email_in_use' });
    if (e.code === 'auth/invalid-email')        return json(400, { error: 'invalid_email' });
    if (e.code === 'auth/invalid-password')     return json(400, { error: 'weak_password' });
    console.error('createUser failed', e);
    return json(500, { error: 'create_user_failed' });
  }

  // Εγγραφή στη βάση. Το κατάστημα μένει "pending" μέχρι να επιβεβαιωθεί το email.
  const now = Date.now();
  try {
    await db.ref().update({
      [`users_to_shops/${user.uid}`]: shopId,
      [`shop_details/${shopId}`]: {
        displayName: shopName, email, status: 'pending', source: 'signup',
        createdAt: now, termsAcceptedAt: now, lang, phone, type, plan
      },
      [`shop_profile/${shopId}/info/notificationEmail`]: email,
      [`signup_meta/${user.uid}/lastVerifySent`]: now
    });
  } catch (e) {
    console.error('db write failed, rolling back', e);
    await admin.auth().deleteUser(user.uid).catch(() => {});
    return json(500, { error: 'db_write_failed' });
  }

  // Email επιβεβαίωσης και ειδοποίηση σε σένα. Αν αποτύχει, ο λογαριασμός μένει
  // και ο χρήστης μπορεί να ζητήσει νέο email από το /admin.
  try {
    const link = await admin.auth().generateEmailVerificationLink(email, { url: ADMIN_URL });
    await sendVerificationEmail({ to: email, shopName, link, lang });
  } catch (e) { console.error('verification email failed', e); }
  try { await notifyOwner({ shopId, shopName, email, phone, type, plan }); }
  catch (e) { console.error('owner notify failed', e); }

  return json(200, { ok: true, shopId });
};
