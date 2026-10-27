// Το κουμπί «Γράψτε κριτική» στο email περνά από εδώ: γράφει ότι ο πελάτης πάτησε και τον στέλνει στη φόρμα κριτικής της Google.
// GET /.netlify/functions/review?s=<shop>&i=<κράτηση>&c=<κωδικός>
const { getDb } = require('./_shared/firebase');
const { reviewUrl, clickCode } = require('./_shared/reviews');

const ID = /^[A-Za-z0-9_-]{1,60}$/;
const go = url => ({ statusCode: 302, headers: { Location: url, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }, body: '' });

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const shop = String(q.s || ''), id = String(q.i || ''), code = String(q.c || '');
  if (!ID.test(shop)) return go('https://tablereserve.gr/');

  const db = getDb();
  let dest = 'https://tablereserve.gr/' + shop;
  try {
    const [det, cfg] = await Promise.all([
      db.ref(`shop_details/${shop}`).get().then(s => s.val()),
      db.ref(`shop_profile/${shop}/reviews`).get().then(s => s.val()),
    ]);
    const url = det && reviewUrl(det, cfg || {});
    if (url) dest = url;

    if (url && ID.test(id) && code) {
      const bRef = db.ref(`reservations/${shop}/${id}`);
      const b = (await bRef.get()).val();
      if (b && b.reviewSentAt && clickCode(id, b) === code && !b.reviewClickedAt) {
        await bRef.child('reviewClickedAt').transaction(cur => (cur ? undefined : Date.now()));
      }
    }
  } catch (e) {
    console.error('[review] click', shop, id, e.message);
  }
  return go(dest);
};
