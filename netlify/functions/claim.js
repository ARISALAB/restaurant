// Ενεργοποίηση προσχεδίου από μέσα από το admin (πιλοτικό: 6 μήνες δωρεάν, χωρίς κάρτα).
//
// Ο ιδιοκτήτης μπήκε στο admin με το προσωπικό link (ανώνυμος λογαριασμός). Για να ενεργοποιήσει,
// ο browser προσθέτει πρώτα email+κωδικό ή Google ΣΤΟΝ ΙΔΙΟ λογαριασμό (link credential), οπότε το uid
// μένει ίδιο και ό,τι έφτιαξε (ωράριο, φωτογραφίες, τραπέζια) μένει όπως είναι.
//
// POST /.netlify/functions/claim     Authorization: Bearer <idToken του ίδιου λογαριασμού>
//   { acceptTerms:true, lang?, phone? }
// ->  200 { ok:true, shopId, status:'active'|'pending' }   |   4xx { error }
//   'pending' = εγγραφή με email: ενεργοποιείται μόλις επιβεβαιωθεί το email (όπως η κανονική εγγραφή)

const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { normLang } = require('./_shared/i18n');
const { sendVerificationEmail, notifyOwner, ADMIN_URL } = require('./_shared/signup');
const { termsFields, logTerms } = require('./_shared/terms');
const { clearSamples } = require('./_shared/drafts');

const PILOT_MS = 183 * 24 * 60 * 60 * 1000;   // 6 μήνες

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }
  if (b.acceptTerms !== true) return json(400, { error: 'terms_required' });
  const lang = normLang(b.lang);
  const phone = String(b.phone || '').trim().slice(0, 30);

  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return json(401, { error: 'no_token' });
  let who;
  try { who = await admin.auth().verifyIdToken(h.slice(7)); }
  catch { return json(401, { error: 'invalid_token' }); }

  const db = getDb();
  const shop = (await db.ref(`users_to_shops/${who.uid}`).get()).val();
  if (!shop) return json(404, { error: 'no_shop' });
  const details = (await db.ref(`shop_details/${shop}`).get()).val();
  if (!details || details.status !== 'draft') return json(409, { error: 'not_draft' });

  // Ο λογαριασμός πρέπει να έχει πλέον email (από κωδικό ή Google)
  const user = await admin.auth().getUser(who.uid);
  const providers = (user.providerData || []).map(p => p.providerId);
  if (!user.email || !providers.length) return json(400, { error: 'not_linked' });
  const email = user.email.toLowerCase();
  const viaGoogle = providers.includes('google.com');
  const verified = viaGoogle || user.emailVerified;

  // Μόνο μία ενεργοποίηση: «καίμε» το link ατομικά
  const tx = await db.ref(`drafts/${shop}/claimedAt`).transaction(cur => (cur ? undefined : Date.now()));
  if (!tx.committed) return json(409, { error: 'already_claimed' });

  const now = Date.now();
  const shopName = details.displayName || shop;
  const terms = termsFields(event, who.uid, viaGoogle ? 'claim-google' : 'claim', now);
  const upd = {
    [`shop_details/${shop}/email`]: email,
    [`shop_details/${shop}/status`]: verified ? 'active' : 'pending',
    [`shop_details/${shop}/source`]: 'draft',
    [`shop_details/${shop}/claimedAt`]: now,
    [`shop_details/${shop}/lang`]: lang,
    [`shop_details/${shop}/paidUntil`]: now + PILOT_MS,
    [`shop_details/${shop}/billingStatus`]: 'trial',
    [`shop_details/${shop}/pilot`]: true,
    [`shop_profile/${shop}/info/notificationEmail`]: email,
    [`drafts/${shop}/token`]: null,
    [`drafts/${shop}/claimedBy`]: email,
  };
  if (verified) upd[`shop_details/${shop}/activatedAt`] = now;
  else upd[`signup_meta/${who.uid}/lastVerifySent`] = now;
  if (phone) upd[`shop_details/${shop}/phone`] = phone;
  for (const [k, v] of Object.entries(terms)) upd[`shop_details/${shop}/${k}`] = v;

  // Οι άλλοι προσωρινοί λογαριασμοί (π.χ. άλλη συσκευή) χάνουν την πρόσβαση: εκεί θα συνδεθεί με το email του
  const others = Object.keys((await db.ref(`drafts/${shop}/admins`).get()).val() || {}).filter(u => u !== who.uid);
  for (const uid of others) {
    if ((await db.ref(`users_to_shops/${uid}`).get()).val() === shop) upd[`users_to_shops/${uid}`] = null;
  }

  try {
    await db.ref().update(upd);
  } catch (e) {
    console.error('[claim] db write failed', e);
    await db.ref(`drafts/${shop}/claimedAt`).remove().catch(() => {});
    return json(500, { error: 'db_write_failed' });
  }

  await Promise.all([
    clearSamples(db, shop).catch(e => console.error('[claim] clear samples failed', e)),
    logTerms(db, shop, terms).catch(e => console.error('[claim] terms log failed', e)),
    ...others.map(uid => admin.auth().getUser(uid)
      .then(u => (u.providerData || []).length ? null : admin.auth().deleteUser(uid)).catch(() => {})),
  ]);

  if (!verified) {
    try {
      const link = await admin.auth().generateEmailVerificationLink(email, { url: ADMIN_URL });
      await sendVerificationEmail({ to: email, shopName, link, lang });
    } catch (e) { console.error('[claim] verification email failed', e); }
  }
  try {
    await notifyOwner({ shopId: shop, shopName, email, phone, type: 'πιλοτικό', plan: '6 μήνες δωρεάν',
      status: verified ? 'ενεργοποιήθηκε από προσχέδιο' : 'ενεργοποίηση από προσχέδιο, αναμονή επιβεβαίωσης email' });
  } catch (e) { console.error('[claim] owner notify failed', e); }

  return json(200, { ok: true, shopId: shop, status: verified ? 'active' : 'pending' });
};
