// Σύνδεσμοι «Προσθήκη στο ημερολόγιο» για μια κράτηση
const { localToMs, tzOr, icsStamp } = require('./time');
const { msg, normLang } = require('./i18n');

const DURATION_MS = 2 * 3600 * 1000;

// lang: 'el' | 'en' | 'de' | ... (παλιές κλήσεις με true/false = en/el)
function calendarText(b, shopName, lang) {
  const m = msg(lang === true ? 'en' : lang === false ? 'el' : lang);
  return { title: m.k_title(shopName, b.guests), details: m.k_details(b.guests, b.time) };
}

function googleCalendarUrl({ b, shopName, address, lang, en, tz }) {
  const start = localToMs(b.date, b.time, tz);
  const { title, details } = calendarText(b, shopName, lang || (en ? 'en' : 'el'));
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${icsStamp(start)}/${icsStamp(start + DURATION_MS)}`,
    details,
    ctz: tzOr(tz),
  });
  if (address) q.set('location', address);
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function icsUrl({ shopId, bookingId, cancelToken, lang }) {
  const q = new URLSearchParams({ shop: shopId, id: bookingId, t: cancelToken, lang: normLang(lang) });
  return 'https://tablereserve.gr/.netlify/functions/ics?' + q.toString();
}

module.exports = { DURATION_MS, calendarText, googleCalendarUrl, icsUrl };
