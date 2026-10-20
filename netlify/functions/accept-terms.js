// Αποδοχή της τρέχουσας έκδοσης των Όρων Χρήσης από το admin του καταστήματος.
// POST /.netlify/functions/accept-terms   (Authorization: Bearer <Firebase ID token>)
//   { version: "2026-10-20" }  ->  200 { ok:true, version }  |  409 { error:"version_mismatch", version }
const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { TERMS_VERSION, termsFields, logTerms } = require('./_shared/terms');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const db = getDb();
  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return json(401, { error: 'no_token' });
  let caller;
  try { caller = await admin.auth().verifyIdToken(h.slice(7)); }
  catch { return json(401, { error: 'invalid_token' }); }

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch {}
  // Ο χρήστης αποδέχεται αυτό που είδε: αν στο μεταξύ άλλαξε η έκδοση, ξαναδιαβάζει
  if (b.version !== TERMS_VERSION) return json(409, { error: 'version_mismatch', version: TERMS_VERSION });

  const shopId = (await db.ref(`users_to_shops/${caller.uid}`).get()).val();
  if (!shopId) return json(404, { error: 'no_shop' });

  const fields = termsFields(event, caller.uid, 'admin');
  try {
    await db.ref(`shop_details/${shopId}`).update(fields);
    await logTerms(db, shopId, fields);
  } catch (e) {
    console.error('[accept-terms]', e);
    return json(500, { error: 'server_error' });
  }
  return json(200, { ok: true, version: TERMS_VERSION });
};
