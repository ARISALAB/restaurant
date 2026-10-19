// Λίστα αναμονής: όταν ελευθερώνονται θέσεις σε μια ώρα, ειδοποιούμε με email όσους περιμένουν.
// Δομή: waitlist/{shop}/{date}/{id} = { name, phone, email, time ("20:30" ή "any"), guests, lang, createdAt, status, notifiedAt }
const { Resend } = require('resend');
const { athensToMs } = require('./time');

const resend = new Resend(process.env.RESEND_API_KEY);
const MAX_NOTIFY = 3;            // πόσους ειδοποιούμε κάθε φορά που ελευθερώνεται τραπέζι
const MIN_AHEAD_MIN = 45;        // όχι για ώρες που είναι πολύ κοντά

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const phoneKey = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.length === 12 && d.startsWith('30')) d = d.slice(2); return d; };

async function shopLink(db, shop) {
  const s = (await db.ref(`shop_details/${shop}/slug`).get()).val();
  if (s) {
    const owner = (await db.ref(`slugs/${s}`).get()).val();
    if (owner && owner.shop === shop) return { base: `https://tablereserve.gr/${s}`, sep: '?' };
  }
  return { base: `https://tablereserve.gr/index.html?shop=${encodeURIComponent(shop)}`, sep: '&' };
}

function fmtDate(d, en) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Intl.DateTimeFormat(en ? 'en-GB' : 'el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd)));
}

function emailHtml({ e, shopName, date, time, url, en }) {
  const t = en ? {
    head: 'A table just opened up!', hi: `Dear <strong>${esc(e.name)}</strong>,`,
    line: `A table became available at the time you were waiting for. It goes to whoever books first, so don't wait too long.`,
    persons: 'guests', btn: 'Book this table', note: 'If you no longer need it, simply ignore this email.'
  } : {
    head: 'Ελευθερώθηκε τραπέζι!', hi: `Αγαπητέ/ή <strong>${esc(e.name)}</strong>,`,
    line: 'Ελευθερώθηκε τραπέζι στην ώρα που περιμένατε. Θα το πάρει όποιος κλείσει πρώτος, οπότε μην αργήσετε.',
    persons: 'άτομα', btn: 'Κλείστε το τραπέζι', note: 'Αν δεν το χρειάζεστε πια, απλώς αγνοήστε αυτό το email.'
  };
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
<div style="max-width:580px;margin:0 auto;">
  <div style="background:#16a34a;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
    <div style="font-size:32px;margin-bottom:8px;">🎉</div>
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${t.head}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">${esc(shopName)}</p>
  </div>
  <div style="background:#fff;padding:28px 32px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 4px;">${t.hi}</p>
    <p style="color:#64748b;font-size:14px;margin:0 0 24px;line-height:1.5;">${t.line}</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px;text-align:center;">
      <p style="margin:0;color:#166534;font-size:22px;font-weight:700;">${esc(time)}</p>
      <p style="margin:4px 0 0;color:#15803d;font-size:14px;">${esc(fmtDate(date, en))} &bull; ${esc(e.guests)} ${t.persons}</p>
    </div>
    <div style="text-align:center;margin-bottom:20px;">
      <a href="${url}" style="display:inline-block;background:#16a34a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;">${t.btn}</a>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin:0;">${t.note}</p>
  </div>
  <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve &bull; noreply@tablereserve.gr</p>
  </div>
</div></body></html>`;
}

// «any» = οποιαδήποτε από τις ώρες που ήταν πλήρεις όταν μπήκε στη λίστα (times)
function matchesTime(e, time) {
  if (e.time === time) return true;
  if (e.time !== 'any') return false;
  return !Array.isArray(e.times) || !e.times.length || e.times.includes(time);
}

// Ελευθερώθηκαν θέσεις στις {date} {time}: ειδοποίησε όσους χωράνε, με σειρά προτεραιότητας
async function notifyWaitlist(db, shop, date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return 0;
  if ((athensToMs(date, time) - Date.now()) / 60000 < MIN_AHEAD_MIN) return 0;
  const capacity = (await db.ref(`shop_profile/${shop}/info/capacity`).get()).val();
  if (typeof capacity !== 'number' || capacity <= 0) return 0;

  const wl = (await db.ref(`waitlist/${shop}/${date}`).get()).val();
  if (!wl) return 0;

  const snap = await db.ref(`reservations/${shop}`).orderByChild('date').equalTo(date).get();
  let booked = 0;
  snap.forEach(c => { const r = c.val() || {}; if (r.status !== 'cancelled' && r.time === time) booked += parseInt(r.guests, 10) || 0; });
  const left = capacity - booked;
  if (left <= 0) return 0;

  const cands = Object.entries(wl)
    .filter(([, e]) => e && e.status === 'waiting' && e.email && matchesTime(e, time) && (parseInt(e.guests, 10) || 0) <= left)
    .sort((a, b) => (a[1].createdAt || 0) - (b[1].createdAt || 0))
    .slice(0, MAX_NOTIFY);
  console.log('[waitlist] freed', shop, date, time, 'left', left, 'candidates', cands.length);
  if (!cands.length) return 0;

  const [shopName, link] = await Promise.all([
    db.ref(`shop_details/${shop}/displayName`).get().then(s => s.val() || shop),
    shopLink(db, shop),
  ]);

  let sent = 0;
  for (const [id, e] of cands) {
    const ref = db.ref(`waitlist/${shop}/${date}/${id}`);
    // Η πρώτη κλήση μπορεί να έρθει με null (χωρίς τοπικά δεδομένα): επιστρέφουμε null ώστε ο server να την ξανατρέξει με την πραγματική τιμή
    const claim = await ref.transaction(cur => {
      if (cur === null) return null;
      if (!cur || cur.status !== 'waiting') return;
      return Object.assign({}, cur, { status: 'notified' });
    });
    const now = claim.snapshot && claim.snapshot.val();
    if (!claim.committed || !now || now.status !== 'notified') continue;
    const en = e.lang === 'en';
    const url = `${link.base}${link.sep}date=${date}&time=${encodeURIComponent(time)}&guests=${encodeURIComponent(e.guests)}&lang=${en ? 'en' : 'el'}`;
    try {
      await resend.emails.send({
        from: 'TableReserve <noreply@tablereserve.gr>',
        to: e.email,
        subject: en ? `🎉 A table opened up: ${shopName}, ${time}` : `🎉 Ελευθερώθηκε τραπέζι: ${shopName}, ${time}`,
        html: emailHtml({ e, shopName, date, time, url, en }),
      });
      await ref.update({ notifiedAt: Date.now(), notifiedTime: time });
      sent++;
    } catch (err) {
      console.error('[waitlist] email failed', shop, id, err.message);
      await ref.child('status').set('waiting').catch(() => {});
    }
  }
  return sent;
}

// Μόλις κάποιος από τη λίστα κλείσει κανονικά, τον βγάζουμε από τη λίστα
async function removeBooked(db, shop, date, phone) {
  const key = phoneKey(phone);
  if (!key) return;
  const wl = (await db.ref(`waitlist/${shop}/${date}`).get()).val() || {};
  const upd = {};
  Object.entries(wl).forEach(([id, e]) => { if (e && phoneKey(e.phone) === key) upd[id] = null; });
  if (Object.keys(upd).length) await db.ref(`waitlist/${shop}/${date}`).update(upd);
}

// Έλεγχος ασφαλείας (από τις προγραμματισμένες υπενθυμίσεις): πιάνει θέσεις που ελευθερώθηκαν με άλλο τρόπο,
// π.χ. αλλαγή ώρας ή λιγότερα άτομα σε μια κράτηση από το admin
async function scanWaitlists(db, today) {
  const all = (await db.ref('waitlist').get()).val() || {};
  let sent = 0;
  for (const [shop, dates] of Object.entries(all)) {
    for (const [date, entries] of Object.entries(dates || {})) {
      if (date < today) continue;
      const times = new Set();
      Object.values(entries || {}).forEach(e => {
        if (!e || e.status !== 'waiting') return;
        if (e.time !== 'any') times.add(e.time);
        else if (Array.isArray(e.times)) e.times.forEach(t => times.add(t));
      });
      for (const t of times) sent += await notifyWaitlist(db, shop, date, t).catch(err => { console.error('[waitlist] scan', shop, date, t, err.message); return 0; });
    }
  }
  return sent;
}

// Email στο κατάστημα: νέος πελάτης στη λίστα αναμονής
async function notifyShopJoin(db, shop, e, date, updated) {
  const to = (await db.ref(`shop_profile/${shop}/info/notificationEmail`).get()).val();
  if (!to) { console.warn('[waitlist] no notificationEmail for', shop); return; }
  const shopName = (await db.ref(`shop_details/${shop}/displayName`).get()).val() || shop;
  const when = e.time === 'any' ? (Array.isArray(e.times) && e.times.length ? e.times.join(', ') : 'οποιαδήποτε ώρα') : e.time;
  const tel = String(e.phone || '').replace(/[^\d+]/g, '');
  const row = (l, v) => `<tr><td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;width:38%;">${l}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${v}</td></tr>`;
  await resend.emails.send({
    from: 'TableReserve <noreply@tablereserve.gr>',
    to,
    subject: `⏳ Λίστα αναμονής - ${shopName} | ${date} ${when} | ${e.name}`,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
<div style="max-width:580px;margin:0 auto;">
  <div style="background:#0f172a;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center;">
    <div style="font-size:30px;margin-bottom:6px;">⏳</div>
    <h1 style="color:#fff;margin:0;font-size:19px;font-weight:700;">${updated ? 'Ενημέρωση αιτήματος στη λίστα αναμονής' : 'Νέο αίτημα στη λίστα αναμονής'}</h1>
    <p style="color:rgba(255,255,255,0.75);margin:6px 0 0;font-size:14px;">${esc(shopName)}</p>
  </div>
  <div style="background:#fff;padding:24px 32px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">
      ${row('Ημερομηνία', esc(fmtDate(date, false)))}
      ${row('Ώρα', esc(when))}
      ${row('Άτομα', esc(e.guests))}
      ${row('Όνομα', esc(e.name))}
      ${row('Τηλέφωνο', `<a href="tel:${esc(tel)}" style="color:#2563eb;text-decoration:none;">${esc(e.phone)}</a>`)}
      ${row('Email', esc(e.email))}
    </table>
    <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">Η ώρα είναι πλήρης. Αν ακυρωθεί κάποια κράτηση, ο πελάτης θα πάρει αυτόματα email για να κλείσει το τραπέζι. Μπορείτε επίσης να τον καλέσετε εσείς, αν βρείτε θέση.</p>
  </div>
  <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:14px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve &bull; noreply@tablereserve.gr</p>
  </div>
</div></body></html>`,
  });
  console.log('[waitlist] shop email sent', shop, to);
}

module.exports = { notifyWaitlist, removeBooked, phoneKey, scanWaitlists, notifyShopJoin };
