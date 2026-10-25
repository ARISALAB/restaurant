// Προσχέδια (πιλοτικό): κοινά εργαλεία για draft.js, claim.js και book.js
//
//   drafts/<id> = { token, createdAt, expiresAt, views, entries, lastEnteredAt, testBookings, ... }
//
// Το προσωπικό link ισχύει 30 ημέρες. Με «νέο link» από τον superadmin παίρνει άλλες 30.

const crypto = require('crypto');

const TRIAL_MS = 30 * 24 * 60 * 60 * 1000;

const expiresOf = d => (d && (d.expiresAt || (d.createdAt ? d.createdAt + TRIAL_MS : 0))) || 0;

const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// null αν το link δεν ισχύει, αλλιώς { details, draft }
async function checkDraft(db, shop, token) {
  if (!/^[A-Za-z0-9_-]{1,60}$/.test(String(shop || '')) || !token) return null;
  const [details, draft] = await Promise.all([
    db.ref(`shop_details/${shop}`).get().then(x => x.val()),
    db.ref(`drafts/${shop}`).get().then(x => x.val()),
  ]);
  if (!details || details.status !== 'draft' || !draft || !sameToken(draft.token, String(token))) return null;
  if (expiresOf(draft) < Date.now()) return null;
  return { details, draft };
}

// ── Δείγμα κρατήσεων ──
// Γεμίζει το admin του προσχεδίου ώστε ο ιδιοκτήτης να δει πώς δουλεύει. Όλα έχουν sample:true
// και σβήνονται με την ενεργοποίηση.

const NAMES = {
  el: ['Γιώργος Παπαδόπουλος', 'Μαρία Κωνσταντίνου', 'Νίκος Αλεξίου', 'Ελένη Σταθοπούλου', 'Δημήτρης Ραφαηλίδης',
    'Κατερίνα Λάμπρου', 'Σοφία Μανωλάκη', 'Παύλος Ιωάννου', 'Αναστασία Βλάχου', 'Κώστας Δημητρίου',
    'Χριστίνα Πετράκη', 'Γιάννης Οικονόμου', 'Βασιλική Ζαχαρίου', 'Θανάσης Μιχαηλίδης'],
  de: ['Thomas Müller', 'Anna Schmidt', 'Michael Weber', 'Julia Fischer', 'Stefan Wagner', 'Laura Becker',
    'Andreas Hoffmann', 'Sabine Schulz', 'Markus Koch', 'Katrin Richter', 'Jan Wolf', 'Petra Neumann',
    'Lukas Braun', 'Monika Zimmermann'],
  en: ['Oliver Smith', 'Emma Johnson', 'James Brown', 'Sophie Wilson', 'Daniel Taylor', 'Charlotte Davies',
    'Thomas Evans', 'Amelia Clarke', 'William Hughes', 'Grace Walker', 'Henry Wright', 'Isabella Green',
    'Jack Robinson', 'Lucy Hall'],
  fr: ['Julien Martin', 'Camille Bernard', 'Nicolas Dubois', 'Léa Moreau', 'Thomas Laurent', 'Chloé Simon',
    'Antoine Michel', 'Manon Lefebvre', 'Pierre Leroy', 'Sarah Roux', 'Hugo Fournier', 'Emma Girard',
    'Louis Bonnet', 'Inès Dupont'],
  it: ['Marco Rossi', 'Giulia Bianchi', 'Luca Romano', 'Francesca Colombo', 'Alessandro Ricci', 'Chiara Marino',
    'Matteo Greco', 'Sara Bruno', 'Andrea Gallo', 'Valentina Conti', 'Davide Costa', 'Elena Giordano',
    'Simone Mancini', 'Martina Rizzo'],
  es: ['Javier García', 'Lucía Martínez', 'Carlos López', 'María Sánchez', 'Pablo González', 'Laura Pérez',
    'Daniel Rodríguez', 'Elena Fernández', 'Sergio Gómez', 'Paula Díaz', 'Alejandro Ruiz', 'Marta Moreno',
    'Diego Álvarez', 'Ana Romero'],
  pt: ['João Silva', 'Ana Santos', 'Pedro Ferreira', 'Mariana Costa', 'Miguel Oliveira', 'Beatriz Rodrigues',
    'Tiago Martins', 'Inês Sousa', 'Rui Pereira', 'Catarina Gomes', 'Nuno Carvalho', 'Sofia Almeida',
    'André Lopes', 'Rita Marques'],
  tr: ['Mehmet Yılmaz', 'Ayşe Kaya', 'Mustafa Demir', 'Elif Şahin', 'Emre Çelik', 'Zeynep Yıldız',
    'Ahmet Öztürk', 'Fatma Aydın', 'Burak Arslan', 'Selin Doğan', 'Can Koç', 'Ece Kurt',
    'Okan Aslan', 'Deniz Polat'],
};
// Λίγοι τουρίστες σε κάθε μαγαζί, όπως στην πραγματικότητα
const VISITORS = {
  el: [['Anna Müller', 'de'], ['James Carter', 'en'], ['Sophie Martin', 'fr']],
  de: [['Γιώργος Παπαδόπουλος', 'el'], ['Emma Johnson', 'en'], ['Marco Rossi', 'it']],
  en: [['Anna Müller', 'de'], ['Μαρία Κωνσταντίνου', 'el'], ['Lucía García', 'es']],
  fr: [['James Carter', 'en'], ['Anna Müller', 'de'], ['Marco Rossi', 'it']],
  it: [['James Carter', 'en'], ['Anna Müller', 'de'], ['Sophie Martin', 'fr']],
  es: [['James Carter', 'en'], ['Anna Müller', 'de'], ['Sophie Martin', 'fr']],
  pt: [['James Carter', 'en'], ['Lucía García', 'es'], ['Sophie Martin', 'fr']],
  tr: [['James Carter', 'en'], ['Anna Müller', 'de'], ['Μαρία Κωνσταντίνου', 'el']],
};
const TEXT = {
  el: { occ: ['Γενέθλια', 'Επέτειος', 'Ονομαστική γιορτή', 'Επαγγελματικό γεύμα'],
    notes: ['Αλλεργία στους ξηρούς καρπούς', 'Καρεκλάκι για μωρό, παρακαλώ', 'Αν γίνεται, τραπέζι κοντά στο παράθυρο', 'Ένας από την παρέα είναι χορτοφάγος'],
    vip: 'Τακτικός πελάτης, του αρέσει το τραπέζι στη γωνία.', allergy: 'Αλλεργία στους ξηρούς καρπούς.' },
  de: { occ: ['Geburtstag', 'Jahrestag', 'Geschäftsessen', 'Familienfeier'],
    notes: ['Nussallergie', 'Bitte einen Kinderstuhl', 'Wenn möglich, Tisch am Fenster', 'Eine Person isst vegetarisch'],
    vip: 'Stammgast, sitzt gern am Ecktisch.', allergy: 'Nussallergie.' },
  en: { occ: ['Birthday', 'Anniversary', 'Business meal', 'Family celebration'],
    notes: ['Nut allergy', 'High chair please', 'Table by the window if possible', 'One guest is vegetarian'],
    vip: 'Regular guest, likes the corner table.', allergy: 'Nut allergy.' },
  fr: { occ: ['Anniversaire', 'Anniversaire de mariage', 'Repas d’affaires', 'Fête de famille'],
    notes: ['Allergie aux fruits à coque', 'Une chaise haute, s’il vous plaît', 'Une table près de la fenêtre si possible', 'Une personne est végétarienne'],
    vip: 'Client régulier, aime la table du coin.', allergy: 'Allergie aux fruits à coque.' },
  it: { occ: ['Compleanno', 'Anniversario', 'Pranzo di lavoro', 'Festa di famiglia'],
    notes: ['Allergia alla frutta a guscio', 'Un seggiolone, per favore', 'Se possibile, tavolo vicino alla finestra', 'Una persona è vegetariana'],
    vip: 'Cliente abituale, ama il tavolo d’angolo.', allergy: 'Allergia alla frutta a guscio.' },
  es: { occ: ['Cumpleaños', 'Aniversario', 'Comida de negocios', 'Celebración familiar'],
    notes: ['Alergia a los frutos secos', 'Una trona, por favor', 'Mesa junto a la ventana si es posible', 'Una persona es vegetariana'],
    vip: 'Cliente habitual, le gusta la mesa del rincón.', allergy: 'Alergia a los frutos secos.' },
  pt: { occ: ['Aniversário', 'Aniversário de casamento', 'Almoço de negócios', 'Festa de família'],
    notes: ['Alergia a frutos secos', 'Uma cadeira de bebé, por favor', 'Mesa junto à janela, se possível', 'Uma pessoa é vegetariana'],
    vip: 'Cliente habitual, gosta da mesa do canto.', allergy: 'Alergia a frutos secos.' },
  tr: { occ: ['Doğum günü', 'Yıl dönümü', 'İş yemeği', 'Aile kutlaması'],
    notes: ['Kuruyemiş alerjisi', 'Bebek sandalyesi lütfen', 'Mümkünse pencere kenarı', 'Bir kişi vejetaryen'],
    vip: 'Düzenli müşteri, köşe masayı sever.', allergy: 'Kuruyemiş alerjisi.' },
};
const LOCS = ['Εσωτερικός', 'Εξωτερικός', 'Δεν έχω προτίμηση'];
const SOURCES = ['google', 'google', 'google', 'site', 'social', 'social', 'direct'];
const WH_DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];   // ίδια σειρά με getUTCDay()

// Γλώσσα του μαγαζιού από τη χώρα (ζώνη ώρας): admin, δείγματα και link
const COUNTRY_LANG = {
  'Europe/Athens': 'el', 'Asia/Nicosia': 'el',
  'Europe/Berlin': 'de', 'Europe/Vienna': 'de', 'Europe/Zurich': 'de',
  'Europe/Paris': 'fr', 'Europe/Brussels': 'fr',
  'Europe/Rome': 'it', 'Europe/Madrid': 'es', 'Europe/Lisbon': 'pt', 'Europe/Istanbul': 'tr',
};
function sampleLang(tz) { return COUNTRY_LANG[tz] || 'en'; }

function phoneFor(lang, i) {
  const n = String(1000000 + ((i * 7919) % 8999999)).padStart(7, '0');
  if (lang === 'el') return '69' + String(40000000 + i * 104729 % 59999999).slice(0, 8);
  if (lang === 'de') return '0151 ' + n;
  if (lang === 'fr') return '06 ' + n.replace(/(\d{2})(\d{2})(\d{2})\d?/, '$1 $2 $3') + ' 4' + (i % 10);
  if (lang === 'it') return '347 ' + n;
  if (lang === 'es') return '6' + n.slice(0, 2) + ' ' + n.slice(2, 5) + ' ' + n.slice(5) + (i % 10);
  if (lang === 'pt') return '91' + (i % 10) + ' ' + n.slice(0, 3) + ' ' + n.slice(3, 6);
  if (lang === 'tr') return '0532 ' + n.slice(0, 3) + ' ' + n.slice(3, 5) + ' ' + n.slice(5, 7);
  return '+44 7700 ' + n.slice(0, 6);
}

function todayIn(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const toMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
const fromMin = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

function slotsFor(ymd, hoursWeek) {
  const day = WH_DAYS[new Date(ymd + 'T12:00:00Z').getUTCDay()];
  const ranges = hoursWeek ? hoursWeek[day] : [{ o: '13:00', c: '23:00' }];
  if (!Array.isArray(ranges) || !ranges.length) return [];
  const out = [];
  for (const r of ranges) {
    let o = toMin(r.o), c = toMin(r.c); if (c <= o) c += 24 * 60;
    for (let m = Math.ceil(o / 30) * 30; m <= c - 60; m += 30) out.push(fromMin(m));
  }
  return out;
}

// Επιστρέφει { reservations, guests } για update στη βάση
function buildSamples({ tz, hoursWeek, now = Date.now(), seed = 1 }) {
  const lang = sampleLang(tz);
  const names = NAMES[lang], txt = TEXT[lang];
  let r = seed * 9301 + 49297;
  const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const pick = a => a[Math.floor(rnd() * a.length)];

  const today = todayIn(tz);
  const reservations = {}, guests = {};
  const regulars = [0, 1, 2].map(i => ({ name: names[i], phone: phoneFor(lang, i) }));   // επαναλαμβανόμενοι πελάτες
  let n = 0;

  for (let d = -14; d <= 7; d++) {
    const ymd = addDays(today, d);
    const slots = slotsFor(ymd, hoursWeek);
    if (!slots.length) continue;
    const weekend = [0, 5, 6].includes(new Date(ymd + 'T12:00:00Z').getUTCDay());
    const count = d === 0 ? 7 : (weekend ? 3 : 2) + Math.floor(rnd() * 2);
    for (let k = 0; k < count; k++) {
      n++;
      let name, phone, bLang = lang;
      const roll = rnd();
      if (roll < 0.22) { const g = regulars[Math.floor(rnd() * regulars.length)]; name = g.name; phone = g.phone; }
      else if (roll < 0.34) { const v = pick(VISITORS[lang]); name = v[0]; bLang = v[1]; phone = '+' + (30 + n) + ' ' + String(600000000 + n * 7717).slice(0, 9); }
      else { name = names[3 + Math.floor(rnd() * (names.length - 3))]; phone = phoneFor(lang, 10 + n); }
      const time = slots[Math.floor(rnd() * slots.length)];
      const madeDaysBefore = 1 + Math.floor(rnd() * 6);
      const rec = {
        name, phone, email: 'demo@tablereserve.gr', date: ymd, time,
        guests: String(pick([2, 2, 2, 3, 4, 4, 5, 6, 8])),
        location: pick(LOCS), occasion: rnd() < 0.15 ? pick(txt.occ) : '',
        comments: rnd() < 0.18 ? pick(txt.notes) : '',
        source: pick(SOURCES), lang: bLang,
        timestamp: d === 0 && k < 2 ? now - (k + 1) * 3600 * 1000 : now - (madeDaysBefore - d) * 86400 * 1000,
        cancelToken: 'sample', status: 'confirmed', sample: true,
      };
      if (d < 0) rec.attendance = rnd() < 0.9 ? 'arrived' : 'noshow';
      if (d > 0 && rnd() < 0.08) { rec.status = 'cancelled'; rec.cancelledAt = now - 3600 * 1000; rec.cancelledBy = 'customer'; }
      reservations[`-sample${String(n).padStart(3, '0')}`] = rec;
    }
  }

  // Καρτέλες πελατών: ένας VIP και μια αλλεργία
  const key = p => String(p).replace(/\D/g, '');
  guests[key(regulars[0].phone)] = { name: regulars[0].name, notes: txt.vip, tags: { vip: true }, updatedAt: now, sample: true };
  guests[key(regulars[1].phone)] = { name: regulars[1].name, notes: txt.allergy, tags: { allergy: true }, updatedAt: now, sample: true };
  return { reservations, guests, lang };
}

// Σβήνει δείγματα και δοκιμαστικές κρατήσεις (στην ενεργοποίηση)
async function clearSamples(db, shop) {
  const upd = {};
  const [res, gst] = await Promise.all([
    db.ref(`reservations/${shop}`).get().then(x => x.val() || {}),
    db.ref(`guests/${shop}`).get().then(x => x.val() || {}),
  ]);
  for (const [id, r] of Object.entries(res)) if (r && (r.sample || r.test)) upd[`reservations/${shop}/${id}`] = null;
  for (const [id, g] of Object.entries(gst)) if (g && g.sample) upd[`guests/${shop}/${id}`] = null;
  if (Object.keys(upd).length) await db.ref().update(upd);
  return Object.keys(upd).length;
}

module.exports = { TRIAL_MS, expiresOf, sameToken, checkDraft, buildSamples, clearSamples, sampleLang };
