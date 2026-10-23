// «Προσθήκη στο Google Wallet»: η κράτηση γίνεται κάρτα στο πορτοφόλι του πελάτη.
// GET /.netlify/functions/wallet?shop=<id>&id=<bookingId>&t=<cancelToken>&lang=el|en  -> 302 στη σελίδα της Google
// GET /.netlify/functions/wallet?probe=1                                              -> { enabled }
// Υπογράφουμε με τον λογαριασμό υπηρεσίας του Firebase (FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY),
// που πρέπει να έχει προστεθεί ως Developer στο Google Pay & Wallet Console.
const crypto = require('crypto');
const { getDb } = require('./_shared/firebase');
const { localToMs } = require('./_shared/time');

const ISSUER = process.env.GOOGLE_WALLET_ISSUER_ID || '';
const SA_EMAIL = process.env.FIREBASE_CLIENT_EMAIL || '';
const SA_KEY = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const ENABLED = !!(ISSUER && SA_EMAIL && SA_KEY);
const CLASS_ID = `${ISSUER}.tablereserve_booking_v1`;

const b64url = x => Buffer.from(x).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function signJwt(payload) {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createSign('RSA-SHA256').update(head + '.' + body).sign(SA_KEY);
  return `${head}.${body}.${b64url(sig)}`;
}
// Access token για το Wallet API (OAuth με JWT του λογαριασμού υπηρεσίας), κρατιέται ~50 λεπτά
let tokenCache = { token: null, exp: 0 };
async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({ iss: SA_EMAIL, scope: 'https://www.googleapis.com/auth/wallet_object.issuer', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
  });
  const d = await r.json();
  if (!r.ok || !d.access_token) throw new Error('token ' + r.status + ' ' + JSON.stringify(d).slice(0, 200));
  tokenCache = { token: d.access_token, exp: Date.now() + 50 * 60000 };
  return d.access_token;
}
const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + await accessToken(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.ok || r.status === 409) return r.status;
  throw new Error(`${method} ${path} ${r.status} ${(await r.text()).slice(0, 300)}`);
}
let classReady = false;
async function ensureClass() {
  if (classReady) return;
  await api('POST', '/genericClass', { id: CLASS_ID });          // 409 = υπάρχει ήδη
  classReady = true;
}
// Δημιουργία ή ενημέρωση της κάρτας (π.χ. αν άλλαξε η ώρα της κράτησης)
async function upsertObject(obj) {
  await ensureClass();
  const st = await api('POST', '/genericObject', obj);
  if (st === 409) await api('PUT', '/genericObject/' + encodeURIComponent(obj.id), obj);
}

const L = (value, lang) => ({ defaultValue: { language: lang, value: String(value) } });
const text = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body });
function png(url, w) {
  if (typeof url !== 'string' || url.indexOf('res.cloudinary.com/') < 0 || url.indexOf('/upload/') < 0) return null;
  return url.replace('/upload/', `/upload/f_png,c_fill,${w}/`);
}
// Λογότυπο: ολόκληρο, χωρίς κόψιμο, σε λευκό τετράγωνο με περιθώριο ~15% (η Google το κόβει σε κύκλο)
function logoUrl(u) {
  if (typeof u !== 'string' || u.indexOf('res.cloudinary.com/') < 0 || u.indexOf('/upload/') < 0) return null;
  return u.replace('/upload/', '/upload/c_pad,b_white,w_440,h_440/c_pad,b_white,w_660,h_660,f_png/');
}

function fmtDate(d, en) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Intl.DateTimeFormat(en ? 'en-GB' : 'el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd)));
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  if (q.probe) return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' }, body: JSON.stringify({ enabled: ENABLED }) };
  if (!ENABLED) return text(503, 'Google Wallet is not configured');

  const shop = String(q.shop || ''), id = String(q.id || ''), token = String(q.t || '');
  const en = q.lang === 'en', lang = en ? 'en' : 'el';
  if (!/^[a-z0-9_]{1,60}$/.test(shop) || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || !token) return text(400, 'Bad request');

  try {
    const db = getDb();
    const b = (await db.ref(`reservations/${shop}/${id}`).get()).val();
    if (!b || b.cancelToken !== token) return text(404, en ? 'Reservation not found' : 'Η κράτηση δεν βρέθηκε');
    if (b.status === 'cancelled') return text(410, en ? 'This reservation was cancelled' : 'Η κράτηση έχει ακυρωθεί');

    const [shopName, info, logo] = await Promise.all([
      db.ref(`shop_details/${shop}/displayName`).get().then(s => s.val() || shop),
      db.ref(`shop_profile/${shop}/info`).get().then(s => s.val() || {}),
      db.ref(`shop_profile/${shop}/logoPhoto`).get().then(s => s.val()),
    ]);
    const start = localToMs(b.date, b.time, info.tz);
    const cancelUrl = `https://tablereserve.gr/cancel.html?token=${token}&shop=${shop}&id=${id}&lang=${lang}`;
    const mapUrl = info.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(shopName + ' ' + info.address) : null;
    const tel = info.phone ? String(info.phone).replace(/[^\d+]/g, '') : '';

    const links = [];
    if (mapUrl) links.push({ id: 'map', uri: mapUrl, description: en ? 'Directions' : 'Οδηγίες' });
    if (tel) links.push({ id: 'tel', uri: 'tel:' + tel, description: (en ? 'Call ' : 'Τηλέφωνο ') + info.phone });
    links.push({ id: 'cancel', uri: cancelUrl, description: en ? 'Cancel reservation' : 'Ακύρωση κράτησης' });

    const modules = [
      { id: 'date', header: en ? 'Date' : 'Ημερομηνία', body: fmtDate(b.date, en) },
      { id: 'guests', header: en ? 'Guests' : 'Άτομα', body: String(b.guests) },
      { id: 'name', header: en ? 'Name' : 'Όνομα', body: String(b.name || '') },
    ];
    if (info.address) modules.push({ id: 'address', header: en ? 'Address' : 'Διεύθυνση', body: String(info.address) });

    const obj = {
      id: `${ISSUER}.${shop}_${id}`.replace(/[^A-Za-z0-9._-]/g, '_'),
      classId: CLASS_ID,
      state: 'ACTIVE',
      cardTitle: L(shopName, lang),
      subheader: L(`${en ? 'Table for' : 'Τραπέζι για'} ${b.guests} · ${fmtDate(b.date, en)}`, lang),
      header: L(b.time, lang),
      hexBackgroundColor: '#1e3a8a',
      logo: { sourceUri: { uri: logoUrl(logo) || 'https://tablereserve.gr/wallet-logo.png' }, contentDescription: L(shopName, lang) },
      textModulesData: modules,
      linksModuleData: { uris: links },
      // Η κάρτα «λήγει» 3 ώρες μετά την κράτηση και φεύγει από τις ενεργές
      validTimeInterval: { end: { date: new Date(start + 3 * 3600000).toISOString() } },
    };

    await upsertObject(obj);
    // Το link περιέχει μόνο το id: η κάρτα έχει ήδη αποθηκευτεί στη Google (μικρό URL, δουλεύει παντού)
    const jwt = signJwt({
      iss: SA_EMAIL,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: ['https://tablereserve.gr'],
      payload: { genericObjects: [{ id: obj.id, classId: CLASS_ID }] },
    });
    return { statusCode: 302, headers: { Location: 'https://pay.google.com/gp/v/save/' + jwt, 'Cache-Control': 'no-store' }, body: '' };
  } catch (e) {
    console.error('[wallet] error:', e);
    return text(500, 'Error');
  }
};
