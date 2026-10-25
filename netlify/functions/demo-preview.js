// Προβολή των email μιας κράτησης για τη σελίδα επίδειξης. Δεν αποθηκεύει τίποτα και δεν στέλνει τίποτα.
// POST /.netlify/functions/demo-preview
//   { shop, date, time, guests, name, phone, email, location, occasion, comments, lang }
// ->  200 { ok:true, customer:{subject,html}, shop:{subject,html} }   |   4xx { error }
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { googleCalendarUrl } = require('./_shared/calendar');
const { shopTz } = require('./_shared/time');
const { normLang } = require('./_shared/i18n');
const { buildCustomerEmail } = require('./notify-customer');
const { buildShopNewEmail } = require('./notify');

// Καταστήματα επίδειξης (εσωτερικό ID, όχι slug)
const DEMO_SHOPS = new Set(['test-restaurant']);

const str = (v, max) => (typeof v === 'string' ? v.trim() : '').slice(0, max);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });
  try {
    const b = JSON.parse(event.body || '{}');
    const shop = str(b.shop, 60);
    if (!DEMO_SHOPS.has(shop)) return json(403, { error: 'not_demo' });
    const date = str(b.date, 10), time = str(b.time, 5);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return json(400, { error: 'bad_request' });
    const lang = normLang(b.lang);
    const booking = {
      date, time,
      guests: Math.max(1, Math.min(50, parseInt(b.guests, 10) || 2)),
      name: str(b.name, 100), phone: str(b.phone, 40), email: str(b.email, 120),
      location: str(b.location, 60), occasion: str(b.occasion, 200), comments: str(b.comments, 1000),
    };

    const db = getDb();
    const [details, address, tz] = await Promise.all([
      db.ref(`shop_details/${shop}`).get().then(x => x.val() || {}),
      db.ref(`shop_profile/${shop}/info/address`).get().then(x => x.val() || ''),
      shopTz(db, shop),
    ]);
    const shopName = details.displayName || shop;

    const customer = buildCustomerEmail({
      booking, shopName, lang,
      gcalUrl: googleCalendarUrl({ b: booking, shopName, address, lang, tz }),
      appleUrl: '#', cancelUrl: '#',
      walletUrl: process.env.GOOGLE_WALLET_ISSUER_ID ? '#' : null,
    });
    // Στο demo ο επισκέπτης είναι ο «ιδιοκτήτης», οπότε και το email του καταστήματος στη δική του γλώσσα
    const shopMail = buildShopNewEmail({ booking, shopName, lang });

    return json(200, { ok: true, customer, shop: shopMail });
  } catch (err) {
    console.error('[demo-preview] error:', err);
    return json(500, { error: 'server_error' });
  }
};
