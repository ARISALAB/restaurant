// Αυτόματη ανάθεση τραπεζιού για νέα κράτηση.
// Ίδια λογική με το admin (admin/index.html → flAutoPick). Αν αλλάξει εδώ, αλλάζει κι εκεί.
//
// shop_floor/<shop> = { on, dur, zones: { id: { n, o } }, tables: { id: { n, s, z, x, y, w, h, sh, j: { otherId: true } } } }
// Η κράτηση κρατά τα τραπέζια στο πεδίο «table»: "t1" ή, για ένωση, "t1,t2".
//
// Κανόνας: το μικρότερο ελεύθερο τραπέζι που χωράει την παρέα. Αν δεν υπάρχει, η μικρότερη
// ένωση ελεύθερων τραπεζιών (έως 4) του ίδιου χώρου. Αλλιώς τίποτα: τη βάζει το προσωπικό.
// Η online διαθεσιμότητα ΔΕΝ εξαρτάται από αυτό.

const DURS = [60, 90, 120, 150, 180, 240];
const MAX_JOIN = 4;

const toMin = s => { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : null; };
const tidsOf = r => String((r && r.table) || '').split(',').filter(Boolean);
const active = r => r && r.status !== 'cancelled' && r.attendance !== 'noshow';
const nameCmp = (a, b) => String(a.n).localeCompare(String(b.n), undefined, { numeric: true });

// Συνδεδεμένες ομάδες τραπεζιών (μέσω των ενώσεων «j»), μέγεθος 2..max, ίδιος χώρος
function joinGroups(tables, ok, max) {
  const byId = {};
  tables.forEach(t => { byId[t.id] = t; });
  // Η ένωση μετράει μόνο αν είναι γραμμένη και στα δύο τραπέζια
  const nb = t => Object.keys(t.j || {}).filter(id => byId[id] && byId[id].z === t.z && (byId[id].j || {})[t.id]);
  const seen = new Set(), out = [];
  const grow = (set) => {
    const key = set.slice().sort().join(',');
    if (seen.has(key)) return;
    seen.add(key);
    if (set.length >= 2) out.push(set.map(id => byId[id]));
    if (set.length >= max) return;
    set.forEach(id => nb(byId[id]).forEach(n => { if (!set.includes(n) && ok(byId[n])) grow(set.concat(n)); }));
  };
  tables.filter(ok).forEach(t => grow([t.id]));
  return out;
}

// floor: shop_floor/<shop>, dayList: [{ id, ...κράτηση }] της ίδιας ημέρας, r: η νέα κράτηση { id, time, guests }
// -> "t1" | "t1,t2" | null
function autoPick(floor, dayList, r) {
  if (!floor || floor.on !== true || !floor.tables) return null;
  const s = toMin(r.time), g = parseInt(r.guests, 10) || 0;
  if (s === null || g < 1) return null;
  const dur = DURS.includes(floor.dur) ? floor.dur : 120;
  const zones = floor.zones || {};
  const zOrd = z => (zones[z] && typeof zones[z].o === 'number') ? zones[z].o : 99;
  const tables = Object.entries(floor.tables).map(([id, t]) => Object.assign({ id }, t))
    .filter(t => zones[t.z] && typeof t.s === 'number');
  const busy = new Set();
  (dayList || []).forEach(x => {
    if (x.id === r.id || !active(x)) return;
    const xs = toMin(x.time);
    if (xs === null || !(xs < s + dur && s < xs + dur)) return;
    tidsOf(x).forEach(id => busy.add(id));
  });
  const free = t => !busy.has(t.id);

  const single = tables.filter(t => free(t) && t.s >= g)
    .sort((a, b) => a.s - b.s || zOrd(a.z) - zOrd(b.z) || nameCmp(a, b))[0];
  if (single) return single.id;

  const seats = grp => grp.reduce((n, t) => n + t.s, 0);
  const grp = joinGroups(tables, free, MAX_JOIN).filter(x => seats(x) >= g)
    .sort((a, b) => seats(a) - seats(b) || a.length - b.length || zOrd(a[0].z) - zOrd(b[0].z))[0];
  return grp ? grp.sort(nameCmp).map(t => t.id).join(',') : null;
}

module.exports = { autoPick, joinGroups, tidsOf };
