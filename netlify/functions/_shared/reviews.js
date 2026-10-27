// Αυτόματο αίτημα κριτικής Google, το επόμενο πρωί μετά την επίσκεψη.
//
// Ρυθμίσεις ανά μαγαζί (τις γράφει ο ιδιοκτήτης από το admin):
//   shop_profile/<id>/reviews = { on: true|false, link: "https://g.page/r/.../review" }
// Αν δεν έχει πατηθεί ποτέ ο διακόπτης: ανοιχτό για όσα μαγαζιά φτιάχτηκαν μετά την κυκλοφορία, κλειστό για τα παλιά.
// Σύνδεσμος: ό,τι έβαλε ο ιδιοκτήτης, αλλιώς το Place ID που έχει ο superadmin (shop_details/<id>/google/placeId).
//
// Κανόνες Google: ίδιο μήνυμα σε όλους, χωρίς αντάλλαγμα, χωρίς να ζητάμε βαθμολογία ή συγκεκριμένο περιεχόμενο.
// Εξαιρούνται μόνο όσοι δεν ήρθαν (ακύρωση / «Δεν ήρθε») και οι δοκιμαστικές κρατήσεις.

const crypto = require('crypto');
const { localToMs, localDay, tzOr } = require('./time');
const { normLang, fmtDate } = require('./i18n');

const LAUNCH_AT = Date.UTC(2026, 9, 27);     // 27/10/2026: μαγαζιά από εδώ και πέρα ξεκινούν με ανοιχτό
const SEND_FROM_HOUR = 11;                    // ώρα μαγαζιού
const SEND_UNTIL_HOUR = 20;                   // αν για κάποιο λόγο δεν έφυγαν ως τότε, δεν στέλνουμε βράδυ
const API_BASE = 'https://tablereserve.gr/.netlify/functions';

function reviewsOn(det, cfg) {
  if (cfg && typeof cfg.on === 'boolean') return cfg.on;
  return !!(det && det.createdAt && det.createdAt >= LAUNCH_AT);
}

// Δεκτοί σύνδεσμοι: ο σύνδεσμος «Ζητήστε κριτικές» του Google Business Profile (g.page/r/...),
// η φόρμα κριτικής (search.google.com/local/writereview?placeid=...), ή σκέτο Place ID.
const PLACE_ID = /^[A-Za-z0-9_-]{20,200}$/;
function cleanLink(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || s.length > 400) return null;
  if (PLACE_ID.test(s)) return 'https://search.google.com/local/writereview?placeid=' + s;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (host === 'g.page' && /^\/r\/[A-Za-z0-9_-]+/.test(u.pathname)) return 'https://g.page' + u.pathname + u.search;
  if (host === 'search.google.com' && u.pathname.startsWith('/local/writereview')) {
    const p = u.searchParams.get('placeid');
    return p && PLACE_ID.test(p) ? 'https://search.google.com/local/writereview?placeid=' + p : null;
  }
  return null;
}

function reviewUrl(det, cfg) {
  const own = cfg && cleanLink(cfg.link);
  if (own) return own;
  const pid = det && det.google && det.google.placeId;
  return pid && PLACE_ID.test(pid) ? 'https://search.google.com/local/writereview?placeid=' + pid : null;
}

// Κωδικός στο link του email, ώστε το κλικ να γράφεται μόνο από τον ίδιο τον πελάτη
function clickCode(id, b) {
  return crypto.createHash('sha256').update(String(b.cancelToken || '') + ':' + id).digest('base64url').slice(0, 16);
}
function clickUrl(shop, id, b) {
  return `${API_BASE}/review?s=${encodeURIComponent(shop)}&i=${encodeURIComponent(id)}&c=${clickCode(id, b)}`;
}

const T = {
  el: {
    subject: s => `Ευχαριστούμε για την επίσκεψή σας στο ${s}`,
    head: 'Ευχαριστούμε!', dear: n => `Αγαπητέ/ή <strong>${n}</strong>,`,
    line: s => `Ευχαριστούμε που επιλέξατε το <strong>${s}</strong>. Αν μας επισκεφθήκατε, θα χαρούμε πολύ να διαβάσουμε τη γνώμη σας στη Google. Παίρνει ένα λεπτό και βοηθά κι άλλους να μας βρουν.`,
    visit: d => `Η κράτησή σας: ${d}`,
    btn: 'Γράψτε κριτική στη Google',
    reply: 'Αν θέλετε να πείτε κάτι μόνο σε εμάς, απλώς απαντήστε σε αυτό το email.',
    once: 'Αυτό είναι το μοναδικό email που θα λάβετε για αυτή την επίσκεψη.',
  },
  en: {
    subject: s => `Thank you for visiting ${s}`,
    head: 'Thank you!', dear: n => `Dear <strong>${n}</strong>,`,
    line: s => `Thank you for choosing <strong>${s}</strong>. If you visited us, we would love to read your thoughts on Google. It takes a minute and helps others find us.`,
    visit: d => `Your reservation: ${d}`,
    btn: 'Write a review on Google',
    reply: 'If you would like to tell us something privately, simply reply to this email.',
    once: 'This is the only email you will receive about this visit.',
  },
  de: {
    subject: s => `Danke für Ihren Besuch bei ${s}`,
    head: 'Vielen Dank!', dear: n => `Liebe/r <strong>${n}</strong>,`,
    line: s => `Danke, dass Sie sich für <strong>${s}</strong> entschieden haben. Wenn Sie bei uns waren, freuen wir uns sehr über Ihre Meinung auf Google. Es dauert nur eine Minute und hilft anderen, uns zu finden.`,
    visit: d => `Ihre Reservierung: ${d}`,
    btn: 'Bewertung auf Google schreiben',
    reply: 'Wenn Sie uns etwas persönlich mitteilen möchten, antworten Sie einfach auf diese E-Mail.',
    once: 'Dies ist die einzige E-Mail, die Sie zu diesem Besuch erhalten.',
  },
  fr: {
    subject: s => `Merci de votre visite chez ${s}`,
    head: 'Merci !', dear: n => `Bonjour <strong>${n}</strong>,`,
    line: s => `Merci d’avoir choisi <strong>${s}</strong>. Si vous êtes venu(e), nous serions ravis de lire votre avis sur Google. Cela prend une minute et aide d’autres personnes à nous trouver.`,
    visit: d => `Votre réservation : ${d}`,
    btn: 'Laisser un avis sur Google',
    reply: 'Si vous souhaitez nous dire quelque chose en privé, répondez simplement à cet e-mail.',
    once: 'C’est le seul e-mail que vous recevrez au sujet de cette visite.',
  },
  it: {
    subject: s => `Grazie per la visita da ${s}`,
    head: 'Grazie!', dear: n => `Gentile <strong>${n}</strong>,`,
    line: s => `Grazie per aver scelto <strong>${s}</strong>. Se sei venuto da noi, saremmo felici di leggere la tua opinione su Google. Ci vuole un minuto e aiuta altre persone a trovarci.`,
    visit: d => `La tua prenotazione: ${d}`,
    btn: 'Scrivi una recensione su Google',
    reply: 'Se vuoi dirci qualcosa in privato, rispondi semplicemente a questa email.',
    once: 'Questa è l’unica email che riceverai per questa visita.',
  },
  es: {
    subject: s => `Gracias por visitar ${s}`,
    head: '¡Gracias!', dear: n => `Hola, <strong>${n}</strong>:`,
    line: s => `Gracias por elegir <strong>${s}</strong>. Si nos visitaste, nos encantaría leer tu opinión en Google. Solo lleva un minuto y ayuda a otras personas a encontrarnos.`,
    visit: d => `Tu reserva: ${d}`,
    btn: 'Escribir una reseña en Google',
    reply: 'Si quieres decirnos algo en privado, simplemente responde a este email.',
    once: 'Este es el único email que recibirás sobre esta visita.',
  },
  tr: {
    subject: s => `${s} ziyaretiniz için teşekkürler`,
    head: 'Teşekkürler!', dear: n => `Sayın <strong>${n}</strong>,`,
    line: s => `<strong>${s}</strong> restoranını seçtiğiniz için teşekkür ederiz. Bizi ziyaret ettiyseniz, Google’daki görüşünüzü okumaktan mutluluk duyarız. Bir dakika sürer ve başkalarının bizi bulmasına yardımcı olur.`,
    visit: d => `Rezervasyonunuz: ${d}`,
    btn: 'Google’da yorum yazın',
    reply: 'Bize özel olarak bir şey söylemek isterseniz bu e-postayı yanıtlamanız yeterli.',
    once: 'Bu ziyaret için alacağınız tek e-posta budur.',
  },
  pt: {
    subject: s => `Obrigado pela sua visita ao ${s}`,
    head: 'Obrigado!', dear: n => `Caro/a <strong>${n}</strong>,`,
    line: s => `Obrigado por escolher o <strong>${s}</strong>. Se nos visitou, gostaríamos muito de ler a sua opinião no Google. Demora um minuto e ajuda outras pessoas a encontrar-nos.`,
    visit: d => `A sua reserva: ${d}`,
    btn: 'Escrever uma avaliação no Google',
    reply: 'Se quiser dizer-nos algo em privado, basta responder a este email.',
    once: 'Este é o único email que receberá sobre esta visita.',
  },
};
const txt = lang => T[normLang(lang)] || T.en;

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function emailHtml({ name, date, time, shopName, link, lang, canReply }) {
  const t = txt(lang);
  const when = date ? `${fmtDate(date, lang)}${time ? ', ' + time : ''}` : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
<div style="max-width:580px;margin:0 auto;">
  <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${t.head}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">${esc(shopName)}</p>
  </div>
  <div style="background:#fff;padding:28px 32px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 12px;">${t.dear(esc(name))}</p>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 8px;">${t.line(esc(shopName))}</p>
    ${when ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 24px;">${esc(t.visit(when))}</p>` : '<div style="height:16px;"></div>'}
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${esc(link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 30px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">${t.btn}</a>
    </div>
    ${canReply ? `<p style="color:#64748b;font-size:13px;line-height:1.6;margin:0 0 8px;">${t.reply}</p>` : ''}
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;margin:0;">${t.once}</p>
  </div>
  <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve &bull; noreply@tablereserve.gr</p>
  </div>
</div></body></html>`;
}

const okEmail = e => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 120;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Στέλνει ένα email κριτικής. Επιστρέφει true/false.
async function sendReviewEmail(resend, { to, name, date, time, shopName, link, lang, replyTo }) {
  const msg = {
    from: `${shopName.replace(/[<>"\r\n]/g, '').slice(0, 60)} via TableReserve <noreply@tablereserve.gr>`,
    to,
    subject: txt(lang).subject(shopName),
    html: emailHtml({ name, date, time, shopName, link, lang, canReply: !!replyTo }),
  };
  if (replyTo) msg.reply_to = replyTo;
  await resend.emails.send(msg);
  return true;
}

// Καλείται από το reminders (κάθε 15 λεπτά). Για κάθε μαγαζί, μία φορά τη μέρα μετά τις 11:00,
// στέλνει στους χθεσινούς πελάτες.
// deadline: οι scheduled functions έχουν όριο ~30". Ό,τι δεν προλάβει, φεύγει στην επόμενη εκτέλεση (15').
async function scanReviews(db, resend, details, now = Date.now(), deadline = now + 22000) {
  let sent = 0, failed = 0;
  for (const [shop, d] of Object.entries(details || {})) {
    if (Date.now() > deadline) break;
    if (!d || d.status === 'pending' || d.status === 'closed' || d.status === 'draft' || (d.paidUntil && d.paidUntil < now)) continue;
    const cfg = (await db.ref(`shop_profile/${shop}/reviews`).get()).val() || {};
    if (!reviewsOn(d, cfg)) continue;
    const link = reviewUrl(d, cfg);
    if (!link) continue;
    const info = (await db.ref(`shop_profile/${shop}/info`).get()).val() || {};
    const tz = tzOr(info.tz);
    const today = localDay(now, tz);
    const hour = (now - localToMs(today, '00:00', tz)) / 3600000;
    if (hour < SEND_FROM_HOUR || hour >= SEND_UNTIL_HOUR) continue;
    const runRef = db.ref(`review_runs/${shop}`);
    if ((await runRef.get()).val() === today) continue;          // σήμερα έγινε ήδη

    // χθες, στην ώρα του μαγαζιού (μεσημέρι χθες -> σωστό και τις μέρες που αλλάζει η ώρα)
    const yesterday = localDay(localToMs(today, '12:00', tz) - 86400000, tz);
    const snap = await db.ref(`reservations/${shop}`).orderByChild('date').equalTo(yesterday).get();
    const due = [];
    snap.forEach(c => {
      const b = c.val() || {};
      if (b.status === 'cancelled' || b.attendance === 'noshow' || b.sample || b.test || b.reviewSentAt || !okEmail(b.email)) return;
      due.push([c.key, b]);
    });

    const shopName = d.displayName || shop;
    const replyTo = okEmail(info.notificationEmail) ? info.notificationEmail : (okEmail(d.email) ? d.email : null);
    let allOk = true;
    for (const [id, b] of due) {
      if (Date.now() > deadline) { allOk = false; break; }
      const flag = db.ref(`reservations/${shop}/${id}/reviewSentAt`);
      const claim = await flag.transaction(cur => (cur ? undefined : now));   // ποτέ δύο φορές
      if (!claim.committed) continue;
      try {
        await sendReviewEmail(resend, {
          to: b.email, name: b.name, date: b.date, time: b.time, shopName,
          link: clickUrl(shop, id, b), lang: b.lang, replyTo,
        });
        sent++;
      } catch (e) {
        failed++; allOk = false;
        console.error('[reviews] send failed', shop, id, e.message);
        await flag.remove().catch(() => {});
      }
      await sleep(600);   // όριο αποστολών του Resend
    }
    if (allOk) await runRef.set(today);   // αν κάτι απέτυχε, ξαναδοκιμάζει στην επόμενη εκτέλεση
  }
  return { sent, failed };
}

module.exports = { LAUNCH_AT, reviewsOn, cleanLink, reviewUrl, clickCode, clickUrl, sendReviewEmail, scanReviews, okEmail };
