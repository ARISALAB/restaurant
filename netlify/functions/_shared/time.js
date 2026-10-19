// Ώρα Αθήνας <-> ms (UTC), με σωστή θερινή/χειμερινή ώρα
const TZ = 'Europe/Athens';

function athensToMs(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  const asAthens = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return guess - (asAthens - guess);
}

function athensDay(ms) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

// 20261023T180000Z (για ημερολόγια)
function icsStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

module.exports = { TZ, athensToMs, athensDay, icsStamp };
