const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');

// Ο superadmin αναγνωρίζεται από το UID (ίδιο με τα Database Rules)
const SUPERADMIN_UID = process.env.SUPERADMIN_UID || 'cGhWqj5Mtiey6AC8CMpiUZDxAGh1';
const SHOP_BASE_URL = 'https://tablereserve.gr/';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const db = getDb(); // αρχικοποιεί και το firebase-admin

  // 1. Έλεγχος ότι καλεί ο superadmin
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return json(401, { error: 'no_token' });

  let caller;
  try {
    caller = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    return json(401, { error: 'invalid_token' });
  }
  if (caller.uid !== SUPERADMIN_UID) return json(403, { error: 'not_superadmin' });

  // 2. Έλεγχος πεδίων
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }

  const shopId      = String(body.shopId || '').trim();
  const displayName = String(body.displayName || '').trim();
  const email       = String(body.email || '').trim().toLowerCase();
  const password    = String(body.password || '');

  if (!shopId || !displayName || !email || !password) return json(400, { error: 'missing_fields' });
  if (!/^[a-zA-Z0-9_]{2,40}$/.test(shopId))            return json(400, { error: 'invalid_shop_id' });
  if (displayName.length > 100)                         return json(400, { error: 'name_too_long' });
  if (password.length < 6)                              return json(400, { error: 'weak_password' });

  // 3. Το ID καταστήματος δεν πρέπει να υπάρχει ήδη
  const existing = await db.ref(`shop_details/${shopId}`).get();
  if (existing.exists()) return json(409, { error: 'shop_exists' });

  // 4. Δημιουργία λογαριασμού
  let user;
  try {
    user = await admin.auth().createUser({ email, password, displayName });
  } catch (e) {
    if (e.code === 'auth/email-already-exists') return json(409, { error: 'email_in_use' });
    if (e.code === 'auth/invalid-email')        return json(400, { error: 'invalid_email' });
    if (e.code === 'auth/invalid-password')     return json(400, { error: 'weak_password' });
    console.error('createUser failed', e);
    return json(500, { error: 'create_user_failed' });
  }

  // 5. Εγγραφή στη βάση, όλα μαζί. Αν αποτύχει, σβήνουμε τον λογαριασμό για να μη μείνει ορφανός.
  try {
    await db.ref().update({
      [`users_to_shops/${user.uid}`]: shopId,
      [`shop_details/${shopId}`]: { displayName, email, createdAt: Date.now() },
    });
  } catch (e) {
    console.error('db write failed, rolling back user', e);
    await admin.auth().deleteUser(user.uid).catch(() => {});
    return json(500, { error: 'db_write_failed' });
  }

  return json(200, { ok: true, shopId, uid: user.uid, url: `${SHOP_BASE_URL}?shop=${shopId}` });
};
