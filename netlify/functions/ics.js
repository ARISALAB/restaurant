// Αρχείο ημερολογίου (.ics) για μια κράτηση, με ειδοποίηση 2 ώρες πριν.
// GET /.netlify/functions/ics?shop=<id>&id=<bookingId>&t=<cancelToken>&lang=el|en|de|fr|it|es|tr|pt
const { getDb } = require('./_shared/firebase');
const { localToMs, shopTz, icsStamp } = require('./_shared/time');
const { DURATION_MS, calendarText } = require('./_shared/calendar');
const { normLang, msg } = require('./_shared/i18n');

const esc = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

// Γραμμές έως 75 bytes, όπως ορίζει το πρότυπο
function fold(line) {
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > 73) { out.push(cur); cur = ' '; bytes = 1; }
    cur += ch; bytes += n;
  }
  out.push(cur);
  return out.join('\r\n');
}

const text = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body });

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const shop = String(q.shop || ''), id = String(q.id || ''), token = String(q.t || '');
  const lang = normLang(q.lang), m = msg(lang);
  if (!/^[a-z0-9_]{1,60}$/.test(shop) || !/^[A-Za-z0-9_-]{1,40}$/.test(id) || !token) return text(400, 'Bad request');

  try {
    const db = getDb();
    const b = (await db.ref(`reservations/${shop}/${id}`).get()).val();
    if (!b || b.cancelToken !== token) return text(404, m.e_not_found);
    if (b.status === 'cancelled') return text(410, m.e_cancelled);

    const [shopName, address, tz] = await Promise.all([
      db.ref(`shop_details/${shop}/displayName`).get().then(s => s.val() || shop),
      db.ref(`shop_profile/${shop}/info/address`).get().then(s => s.val() || ''),
      shopTz(db, shop),
    ]);
    const start = localToMs(b.date, b.time, tz);
    const { title, details } = calendarText(b, shopName, lang);
    const cancelUrl = `https://tablereserve.gr/cancel.html?token=${token}&shop=${shop}&id=${id}&lang=${lang}`;
    const desc = details + '\n\n' + m.k_cancel + cancelUrl;

    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TableReserve//Booking//EL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${id}@tablereserve.gr`,
      `DTSTAMP:${icsStamp(Date.now())}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(start + DURATION_MS)}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(desc)}`,
      address ? `LOCATION:${esc(address)}` : null,
      `URL:${cancelUrl}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT2H', `DESCRIPTION:${esc(title)}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).map(fold);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="tablereserve.ics"',
        'Cache-Control': 'no-store',
      },
      body: lines.join('\r\n') + '\r\n',
    };
  } catch (e) {
    console.error('[ics] error:', e);
    return text(500, 'Error');
  }
};
