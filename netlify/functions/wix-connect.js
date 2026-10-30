// Σύνδεση / αποσύνδεση ενός site Wix με κατάστημα TableReserve
//
// POST /.netlify/functions/wix-connect
//   { action:'preview',    instance }  + Authorization: Bearer <Firebase ID token>
//        -> { shop, name }                     (ποιο κατάστημα θα συνδεθεί)
//   { action:'connect',    instance }  + Authorization: Bearer <Firebase ID token>
//        -> { ok:true, shop, name }
//   { action:'disconnect', instance }  (μόνο ο ιδιοκτήτης του site, από το dashboard του Wix)
//        -> { ok:true }
//
// Για σύνδεση χρειάζονται ΚΑΙ τα δύο: ο ιδιοκτήτης του site Wix (instance από το dashboard)
// και συνδεδεμένος χρήστης του TableReserve με δικό του κατάστημα.
const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { wixIdentify } = require('./_shared/wix');

async function callerShop(db, event) {
  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return { error: json(401, { error: 'no_token' }) };
  let caller;
  try { caller = await admin.auth().verifyIdToken(h.slice(7)); }
  catch { return { error: json(401, { error: 'invalid_token' }) }; }
  if (caller.firebase && caller.firebase.sign_in_provider === 'anonymous') return { error: json(403, { error: 'anonymous' }) };
  const shop = (await db.ref(`users_to_shops/${caller.uid}`).get()).val();
  if (!shop) return { error: json(404, { error: 'no_shop' }) };
  const d = (await db.ref(`shop_details/${shop}`).get()).val() || {};
  if (d.status === 'closed') return { error: json(403, { error: 'shop_closed' }) };
  if (d.status === 'draft') return { error: json(403, { error: 'shop_draft' }) };
  return { uid: caller.uid, shop, name: d.displayName || shop };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }
  const action = String(b.action || '');

  const who = await wixIdentify(b.instance);
  if (!who) return json(401, { error: 'invalid_wix_token' });
  if (!who.owner) return json(403, { error: 'not_site_owner' });

  const db = getDb();
  try {
    if (action === 'disconnect') {
      await db.ref(`wix_sites/${who.instanceId}`).remove();
      return json(200, { ok: true });
    }

    const c = await callerShop(db, event);
    if (c.error) return c.error;

    if (action === 'preview') return json(200, { shop: c.shop, name: c.name });

    if (action === 'connect') {
      await db.ref(`wix_sites/${who.instanceId}`).set({
        shop: c.shop,
        uid: c.uid,
        siteId: who.siteId,
        connectedAt: Date.now(),
      });
      return json(200, { ok: true, shop: c.shop, name: c.name });
    }
    return json(400, { error: 'bad_action' });
  } catch (e) {
    console.error('[wix-connect]', e);
    return json(500, { error: 'server_error' });
  }
};
