// Καθημερινός συγχρονισμός συνδρομών Wix -> TableReserve (paidUntil κ.λπ.)
// Χρειάζεται για ανανεώσεις, ακυρώσεις και μηνιαία πλάνα, όταν ο ιδιοκτήτης δεν ανοίγει το dashboard.
const { getDb } = require('./_shared/firebase');
const { syncWixBilling } = require('./_shared/wix');

exports.handler = async () => {
  if (!process.env.WIX_APP_SECRET) { console.warn('[wix-sync] WIX_APP_SECRET missing'); return { statusCode: 200, body: 'skipped' }; }
  const db = getDb();
  const sites = (await db.ref('wix_sites').get()).val() || {};
  let ok = 0, fail = 0;
  for (const [instanceId, link] of Object.entries(sites)) {
    if (!link || !link.shop) continue;
    try { (await syncWixBilling(db, instanceId, link.shop)) ? ok++ : fail++; }
    catch (e) { fail++; console.warn('[wix-sync]', instanceId, e && e.message); }
  }
  console.log('[wix-sync]', { ok, fail });
  return { statusCode: 200, body: JSON.stringify({ ok, fail }) };
};
