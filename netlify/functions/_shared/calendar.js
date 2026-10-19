// Σύνδεσμοι «Προσθήκη στο ημερολόγιο» για μια κράτηση
const { athensToMs, icsStamp } = require('./time');

const DURATION_MS = 2 * 3600 * 1000;

function calendarText(b, shopName, en) {
  return {
    title: en ? `Reservation: ${shopName} (${b.guests} guests)` : `Κράτηση: ${shopName} (${b.guests} άτομα)`,
    details: en ? `Table for ${b.guests} at ${b.time}. Booked via TableReserve.` : `Τραπέζι για ${b.guests} στις ${b.time}. Κράτηση μέσω TableReserve.`,
  };
}

function googleCalendarUrl({ b, shopName, address, en }) {
  const start = athensToMs(b.date, b.time);
  const { title, details } = calendarText(b, shopName, en);
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${icsStamp(start)}/${icsStamp(start + DURATION_MS)}`,
    details,
    ctz: 'Europe/Athens',
  });
  if (address) q.set('location', address);
  return 'https://calendar.google.com/calendar/render?' + q.toString();
}

function icsUrl({ shopId, bookingId, cancelToken, lang }) {
  const q = new URLSearchParams({ shop: shopId, id: bookingId, t: cancelToken, lang: lang === 'en' ? 'en' : 'el' });
  return 'https://tablereserve.gr/.netlify/functions/ics?' + q.toString();
}

module.exports = { DURATION_MS, calendarText, googleCalendarUrl, icsUrl };
