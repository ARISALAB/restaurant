// Καθημερινή διαγραφή καταστημάτων που έκλεισαν πριν από 30+ ημέρες (δέσμευση της Πολιτικής Απορρήτου)
const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');

exports.handler = async () => {
  const db = getDb();
  const now = Date.now();
  const details = (await db.ref('shop_details').get()).val() || {};
  const due = Object.entries(details).filter(([, d]) => d && d.status === 'closed' && d.deleteAfter && d.deleteAfter <= now);
  if (!due.length) { console.log('purge: nothing to delete'); return { statusCode: 200, body: 'nothing' }; }

  const links = (await db.ref('users_to_shops').get()).val() || {};
  for (const [shopId] of due) {
    const uids = Object.keys(links).filter(uid => links[uid] === shopId);
    for (const uid of uids) {
      await admin.auth().deleteUser(uid).catch(e => { if (e.code !== 'auth/user-not-found') console.error('deleteUser', uid, e.message); });
    }
    const upd = {
      [`reservations/${shopId}`]: null,
      [`shop_profile/${shopId}`]: null,
      [`shop_details/${shopId}`]: null
    };
    uids.forEach(uid => { upd[`users_to_shops/${uid}`] = null; upd[`signup_meta/${uid}`] = null; });
    await db.ref().update(upd);
    console.log('purged', shopId, 'users', uids.length);
  }
  return { statusCode: 200, body: `purged ${due.length}` };
};
