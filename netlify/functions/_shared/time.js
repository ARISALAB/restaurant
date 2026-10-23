// Τοπική ώρα καταστήματος <-> ms (UTC), με σωστή θερινή/χειμερινή ώρα.
// Κάθε κατάστημα έχει ζώνη ώρας στο shop_profile/{shop}/info/tz (π.χ. "Europe/Lisbon").
// Όσα δεν έχουν, θεωρούνται Αθήνα.
const TZ = 'Europe/Athens';

function validTz(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64 || !/^[A-Za-z0-9_+\-\/]+$/.test(tz)) return false;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}
const tzOr = tz => (validTz(tz) ? tz : TZ);

function partsIn(ms, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
}

// "2026-10-23", "20:30" στην ώρα του καταστήματος -> ms
function localToMs(date, time, tz) {
  tz = tzOr(tz);
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const want = Date.UTC(y, m - 1, d, hh, mm);
  let ms = want - (partsIn(want, tz) - want);
  ms += want - partsIn(ms, tz);          // δεύτερο πέρασμα: σωστό και τις μέρες που αλλάζει η ώρα
  return ms;
}

// ms -> "2026-10-23" στην ημερομηνία του καταστήματος
function localDay(ms, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tzOr(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

async function shopTz(db, shop) {
  const v = await db.ref(`shop_profile/${shop}/info/tz`).get().then(s => s.val()).catch(() => null);
  return tzOr(v);
}

// Παλιά ονόματα (ώρα Αθήνας)
const athensToMs = (date, time) => localToMs(date, time, TZ);
const athensDay = ms => localDay(ms, TZ);

// 20261023T180000Z (για ημερολόγια)
function icsStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

module.exports = { TZ, validTz, tzOr, localToMs, localDay, shopTz, athensToMs, athensDay, icsStamp };
