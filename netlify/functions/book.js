// Νέα κράτηση από τη σελίδα του εστιατορίου. Όλοι οι έλεγχοι γίνονται εδώ, όχι στον browser.
// POST /.netlify/functions/book
//   { shop, date:"2026-10-12", time:"20:30", guests, name, phone, email, location, occasion, comments, lang, website }
// ->  200 { ok:true, bookingId }   |   4xx { error: "slot_full" | "shop_inactive" | "day_closed" | "bad_time" |
//                                           "too_many_guests" | "rate_limited" | "bad_request" }
const crypto = require('crypto');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const notifyShop = require('./notify');
const notifyCustomer = require('./notify-customer');

const WH_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HOLD_MS = 2 * 60 * 1000;          // πόσο μετράει μια «κράτηση σε εξέλιξη»
const RATE_WINDOW_MS = 10 * 60 * 1000;  // ανά IP: μέχρι RATE_MAX κρατήσεις σε 10 λεπτά
const RATE_MAX = 6;

const str = (v, max) => (typeof v === 'string' ? v.trim() : '').slice(0, max);
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

// Ίδια λογική με τη σελίδα κράτησης (index.html → slotsForDate)
function slotsForDate(dateStr, hoursWeek, openHour, closeHour) {
  if (!hoursWeek) {
    const out = [];
    for (let m = openHour * 60; m < closeHour * 60; m += 30) out.push(fromMin(m));
    return out;
  }
  const day = WH_DAYS[(new Date(dateStr + 'T12:00:00Z').getUTCDay() + 6) % 7];
  const v = hoursWeek[day];
  if (!v || v === 'closed') return null;
  const ranges = (Array.isArray(v) ? v : Object.values(v)).filter(r => r && r.o && r.c);
  if (!ranges.length) return null;
  const set = new Set();
  ranges.forEach(r => {
    const o = toMin(r.o); let c = toMin(r.c); if (c <= o) c = 24 * 60;
    for (let m = o; m <= c - 30 && m < 24 * 60; m += 30) set.add(fromMin(m));
  });
  return [...set];
}

function dayStr(ms) { return new Date(ms).toISOString().slice(0, 10); }

async function rateLimited(db, event) {
  const h = event.headers || {};
  const ip = h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0].trim();
  if (!ip) return false;
  const key = crypto.createHash('sha256').update('tr:' + ip).digest('hex').slice(0, 32);
  const now = Date.now();
  const r = await db.ref(`booking_rate/${key}`).transaction(cur => {
    if (!cur || now - cur.start > RATE_WINDOW_MS) return { start: now, n: 1 };
    if (cur.n >= RATE_MAX) return;            // abort → όριο
    return { start: cur.start, n: cur.n + 1 };
  });
  return !r.committed;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'bad_request' }); }

  // Κρυφό πεδίο: άνθρωπος δεν το βλέπει, τα bots το συμπληρώνουν
  if (b.website) return json(200, { ok: true });

  const shop = String(b.shop || '').toLowerCase();
  const date = String(b.date || '');
  const time = String(b.time || '');
  const guests = parseInt(b.guests, 10);
  const name = str(b.name, 100), phone = str(b.phone, 30), email = str(b.email, 120);
  const location = str(b.location, 60), occasion = str(b.occasion, 200), comments = str(b.comments, 1000);
  const lang = b.lang === 'en' ? 'en' : 'el';

  if (!/^[a-z0-9_]{1,60}$/.test(shop) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) ||
      !(guests >= 1) || !name || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'bad_request' });
  }
  // Όχι παρελθόν (με περιθώριο ζώνης ώρας), όχι πάνω από ~13 μήνες μπροστά
  const now = Date.now();
  if (date < dayStr(now - 14 * 3600 * 1000) || date > dayStr(now + 400 * 86400 * 1000)) {
    return json(400, { error: 'bad_time' });
  }

  try {
    const db = getDb();

    const [details, info] = await Promise.all([
      db.ref(`shop_details/${shop}`).get().then(s => s.val()),
      db.ref(`shop_profile/${shop}/info`).get().then(s => s.val() || {}),
    ]);
    if (!details) return json(404, { error: 'shop_inactive' });
    if (details.status === 'pending' || details.status === 'closed' ||
        (details.paidUntil && details.paidUntil < now)) {
      return json(403, { error: 'shop_inactive' });
    }

    const openHour  = typeof details.openHour  === 'number' ? details.openHour  : 8;
    const closeHour = typeof details.closeHour === 'number' ? details.closeHour : 23;
    const slots = slotsForDate(date, info.hoursWeek || null, openHour, closeHour);
    if (slots === null) return json(400, { error: 'day_closed' });
    if (!slots.includes(time)) return json(400, { error: 'bad_time' });

    const maxParty = (typeof info.maxParty === 'number' && info.maxParty > 0)
      ? Math.min(info.maxParty, 50)
      : (typeof details.maxGuests === 'number' ? details.maxGuests : 8);
    if (guests > maxParty) return json(400, { error: 'too_many_guests' });

    if (await rateLimited(db, event)) return json(429, { error: 'rate_limited' });

    const resRef = db.ref(`reservations/${shop}`);
    const bookingId = resRef.push().key;
    const capacity = typeof info.capacity === 'number' && info.capacity > 0 ? info.capacity : null;
    const holdRef = db.ref(`slot_holds/${shop}/${date}/${time.replace(':', '')}`);

    if (capacity) {
      // Κρατήσεις που ήδη υπάρχουν στη βάση για αυτή την ημέρα
      const snap = await resRef.orderByChild('date').equalTo(date).get();
      const known = new Set();
      let booked = 0;
      snap.forEach(c => {
        known.add(c.key);
        const r = c.val() || {};
        if (r.status !== 'cancelled' && r.time === time) booked += parseInt(r.guests, 10) || 0;
      });

      // Atomic έλεγχος: μετράμε και όσες κρατήσεις γίνονται αυτή τη στιγμή από άλλους πελάτες
      const t = Date.now();
      const tx = await holdRef.transaction(cur => {
        const next = {};
        let inFlight = 0;
        Object.entries(cur || {}).forEach(([id, h]) => {
          if (!h || t - h.t > HOLD_MS) return;       // παλιό, πετιέται
          next[id] = h;
          if (!known.has(id)) inFlight += h.g || 0;   // δεν φαίνεται ακόμα στις κρατήσεις
        });
        if (booked + inFlight + guests > capacity) return;   // abort → πλήρες
        next[bookingId] = { g: guests, t };
        return next;
      });
      if (!tx.committed) return json(409, { error: 'slot_full' });
    }

    const cancelToken = crypto.randomBytes(8).toString('hex');
    try {
      await resRef.child(bookingId).set({
        name, phone, email, date, time,
        guests: String(guests),
        location, occasion, comments,
        timestamp: Date.now(),
        cancelToken,
        status: 'confirmed',
      });
    } catch (e) {
      if (capacity) await holdRef.child(bookingId).remove().catch(() => {});
      throw e;
    }

    // Emails: ίδια πρότυπα με πριν, καλούνται από εδώ αντί από τον browser
    const call = (mod, body) => mod.handler({ httpMethod: 'POST', body: JSON.stringify(body) });
    const results = await Promise.allSettled([
      call(notifyShop, { shopId: shop, bookingId }),
      call(notifyCustomer, { shopId: shop, bookingId, cancelToken, lang }),
    ]);
    results.forEach((r, i) => {
      if (r.status === 'rejected' || (r.value && r.value.statusCode >= 400)) {
        console.warn('[book] email', i ? 'customer' : 'shop', 'failed', r.reason || r.value.body);
      }
    });

    return json(200, { ok: true, bookingId });
  } catch (err) {
    console.error('[book] error:', err);
    return json(500, { error: 'server_error' });
  }
};
