// Υπενθύμιση στον πελάτη 2 ώρες πριν την κράτηση: με email και, αν το ζήτησε, με ειδοποίηση στο κινητό.
// Τρέχει αυτόματα κάθε 15 λεπτά (βλ. netlify.toml).
const { Resend } = require('resend');
const webpush = require('web-push');
const { getDb } = require('./_shared/firebase');
const { localToMs, localDay, tzOr } = require('./_shared/time');
const { scanWaitlists } = require('./_shared/waitlist');

const resend = new Resend(process.env.RESEND_API_KEY);
const PUSH_ON = !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (PUSH_ON) webpush.setVapidDetails('mailto:info@tablereserve.gr', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
const BEFORE_MIN = 120;       // πόσα λεπτά πριν στέλνεται
const WINDOW_MIN = 30;        // περιθώριο, αν καθυστερήσει κάποια εκτέλεση
const MIN_LEAD_MIN = 150;     // κρατήσεις που έγιναν λιγότερο από 2,5 ώρες πριν δεν χρειάζονται υπενθύμιση

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(d, en) {
  const [y, m, dd] = d.split('-').map(Number);
  return new Intl.DateTimeFormat(en ? 'en-GB' : 'el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, dd)));
}

function emailHtml({ b, shopName, info, en }) {
  const t = en ? {
    head: 'See you soon!', hi: `Dear <strong>${esc(b.name)}</strong>,`,
    line: 'This is a friendly reminder of your upcoming reservation.', persons: 'guests',
    addr: '📍 Address', map: 'Directions', phone: '📞 Phone',
    cant: 'If you can no longer make it, please let the restaurant know so they can give the table to someone else.',
    foot: 'TableReserve &bull; noreply@tablereserve.gr'
  } : {
    head: 'Σας περιμένουμε!', hi: `Αγαπητέ/ή <strong>${esc(b.name)}</strong>,`,
    line: 'Σας υπενθυμίζουμε την κράτησή σας σε λίγο.', persons: 'άτομα',
    addr: '📍 Διεύθυνση', map: 'Οδηγίες', phone: '📞 Τηλέφωνο',
    cant: 'Αν τελικά δεν μπορείτε να έρθετε, ενημερώστε το κατάστημα ώστε να δώσει το τραπέζι σε κάποιον άλλο.',
    foot: 'TableReserve &bull; noreply@tablereserve.gr'
  };
  const row = (l, v) => `<tr><td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;width:38%;">${l}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${v}</td></tr>`;
  const mapUrl = info.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(shopName + ' ' + info.address) : '';
  const tel = info.phone ? String(info.phone).replace(/[^\d+]/g, '') : '';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
<div style="max-width:580px;margin:0 auto;">
  <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
    <div style="font-size:32px;margin-bottom:8px;">⏰</div>
    <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${t.head}</h1>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">${esc(shopName)}</p>
  </div>
  <div style="background:#fff;padding:28px 32px;">
    <p style="color:#1e293b;font-size:15px;margin:0 0 4px;">${t.hi}</p>
    <p style="color:#64748b;font-size:14px;margin:0 0 24px;">${t.line}</p>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
      <p style="margin:0;color:#1d4ed8;font-size:22px;font-weight:700;">${esc(b.time)}</p>
      <p style="margin:4px 0 0;color:#3b82f6;font-size:14px;">${esc(fmtDate(b.date, en))} &bull; ${esc(b.guests)} ${t.persons}</p>
    </div>
    ${(info.address || tel) ? `<table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      ${info.address ? row(t.addr, `${esc(info.address)}<br><a href="${mapUrl}" style="color:#2563eb;font-size:13px;">${t.map} →</a>`) : ''}
      ${tel ? row(t.phone, `<a href="tel:${esc(tel)}" style="color:#2563eb;text-decoration:none;">${esc(info.phone)}</a>`) : ''}
    </table>` : ''}
    <p style="color:#64748b;font-size:13px;line-height:1.6;margin:0;">${t.cant}</p>
  </div>
  <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
    <p style="color:#94a3b8;font-size:12px;margin:0;">${t.foot}</p>
  </div>
</div></body></html>`;
}

function pushIcon(logo) {
  if (typeof logo !== 'string' || logo.indexOf('res.cloudinary.com/') < 0 || logo.indexOf('/upload/') < 0) return undefined;
  return logo.replace('/upload/', '/upload/f_png,c_fill,w_192,h_192/');
}

async function sendPush({ db, shop, id, b, shopName, info, logo, en }) {
  const mapUrl = info.address ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(shopName + ' ' + info.address) : null;
  const cancelUrl = `https://tablereserve.gr/cancel.html?token=${b.cancelToken}&shop=${shop}&id=${id}&lang=${en ? 'en' : 'el'}`;
  const payload = JSON.stringify({
    title: en ? `⏰ ${shopName} at ${b.time}` : `⏰ ${shopName} στις ${b.time}`,
    body: en ? `Your table for ${b.guests} is waiting for you. Tap for directions.` : `Σας περιμένουμε, τραπέζι για ${b.guests}. Πατήστε για οδηγίες.`,
    url: mapUrl || cancelUrl,
    icon: pushIcon(logo),
    tag: 'tr-' + id,
  });
  try {
    await webpush.sendNotification({ endpoint: b.push.endpoint, keys: { p256dh: b.push.p256dh, auth: b.push.auth } }, payload, { TTL: 3600, urgency: 'high' });
    return true;
  } catch (e) {
    // Ο πελάτης έκλεισε τις ειδοποιήσεις ή άλλαξε συσκευή: σβήνουμε τη συνδρομή
    if (e.statusCode === 404 || e.statusCode === 410) await db.ref(`reservations/${shop}/${id}/push`).remove().catch(() => {});
    console.warn('[reminders] push failed', shop, id, e.statusCode || e.message);
    return false;
  }
}

exports.handler = async () => {
  const db = getDb();
  const now = Date.now();
  const details = (await db.ref('shop_details').get()).val() || {};
  let sent = 0, pushed = 0, failed = 0;

  for (const [shop, d] of Object.entries(details)) {
    if (!d || d.status === 'pending' || d.status === 'closed' || (d.paidUntil && d.paidUntil < now)) continue;
    const info = (await db.ref(`shop_profile/${shop}/info`).get()).val() || {};
    if (info.remindersOff === true) continue;
    const tz = tzOr(info.tz);
    const days = [...new Set([localDay(now, tz), localDay(now + BEFORE_MIN * 60000, tz)])];
    let logo;

    for (const day of days) {
      const snap = await db.ref(`reservations/${shop}`).orderByChild('date').equalTo(day).get();
      const due = [];
      snap.forEach(c => {
        const b = c.val() || {};
        if (b.status === 'cancelled' || b.reminderSentAt || !b.time || (!b.email && !(PUSH_ON && b.push && b.push.endpoint))) return;
        const at = localToMs(b.date, b.time, tz);
        const mins = (at - now) / 60000;
        if (mins > BEFORE_MIN || mins <= BEFORE_MIN - WINDOW_MIN) return;
        if (b.timestamp && (at - b.timestamp) / 60000 < MIN_LEAD_MIN) return;
        due.push([c.key, b]);
      });

      for (const [id, b] of due) {
        const flag = db.ref(`reservations/${shop}/${id}/reminderSentAt`);
        const claim = await flag.transaction(cur => (cur ? undefined : now));   // ποτέ δύο φορές
        if (!claim.committed) continue;
        const en = b.lang === 'en';
        const shopName = d.displayName || shop;
        let ok = false;
        if (b.email) {
          try {
            await resend.emails.send({
              from: 'TableReserve <noreply@tablereserve.gr>',
              to: b.email,
              subject: en ? `⏰ Reminder: ${shopName} at ${b.time}` : `⏰ Υπενθύμιση: ${shopName} στις ${b.time}`,
              html: emailHtml({ b, shopName, info, en })
            });
            sent++; ok = true;
          } catch (e) {
            console.error('[reminders] send failed', shop, id, e.message);
          }
        }
        if (PUSH_ON && b.push && b.push.endpoint) {
          if (logo === undefined) logo = (await db.ref(`shop_profile/${shop}/logoPhoto`).get()).val() || null;
          if (await sendPush({ db, shop, id, b, shopName, info, logo, en })) { pushed++; ok = true; }
        }
        if (!ok) { failed++; await flag.remove().catch(() => {}); }
      }
    }
  }
  const wl = await scanWaitlists(db).catch(e => { console.error('[reminders] waitlist scan', e.message); return 0; });
  console.log(`[reminders] email ${sent}, push ${pushed}, failed ${failed}, waitlist ${wl}`);
  return { statusCode: 200, body: JSON.stringify({ sent, pushed, failed }) };
};
