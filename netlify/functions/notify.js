// Email στο κατάστημα για κάθε νέα κράτηση, στη γλώσσα του καταστήματος (shop_details/{shop}/lang)
const { Resend } = require('resend');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { locationLabel, occasionLabel, msg, shopLang, fmtDate } = require('./_shared/i18n');

const resend = new Resend(process.env.RESEND_API_KEY);

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Το email «Νέα κράτηση» προς το κατάστημα. Χρησιμοποιείται και από την προβολή του demo.
function buildShopNewEmail({ booking, shopName, lang }) {
  const m = msg(lang);
  const t = {
    subject: m.s_new, head: m.s_new, persons: m.persons,
    name: m.s_name, phone: m.s_phone, occasion: m.s_occasion, comments: m.s_comments, btn: m.s_btn
  };
  const loc = locationLabel(booking.location, lang);
  const row = (l, v) => `
      <tr><td style="padding:12px 2px;border-bottom:1px solid #e2e8f0;"><p style="font-size:12px;font-weight:600;color:#64748b;margin:0 0 3px;letter-spacing:0.02em;">${l}</p><p style="font-size:15px;color:#0f172a;margin:0;word-break:break-word;overflow-wrap:anywhere;">${v}</p></td></tr>`;
  return { subject: `${t.subject} - ${shopName} | ${booking.date || ''} ${booking.time || ''} | ${booking.name || ''}`, html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:12px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:24px 20px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${t.head}</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">${esc(shopName)}</p>
    </div>
    <div style="background:#fff;padding:24px 20px;">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:#1d4ed8;font-size:16px;font-weight:600;">${esc(booking.date ? fmtDate(booking.date, lang) : '-')}</p>
        <p style="margin:2px 0 0;color:#1d4ed8;font-size:28px;font-weight:700;line-height:1.2;">${esc(booking.time || '-')}</p>
        <p style="margin:6px 0 0;color:#3b82f6;font-size:14px;">${esc(booking.guests || '-')} ${t.persons}${loc ? ' &middot; ' + esc(loc) : ''}</p>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;">
        ${row(t.name, esc(booking.name || '-'))}
        ${row(t.phone, booking.phone ? `<a href="tel:${esc(String(booking.phone).replace(/[^\d+]/g, ''))}" style="color:#1d4ed8;text-decoration:none;">${esc(booking.phone)}</a>` : '-')}
        ${booking.email ? row('Email', `<a href="mailto:${esc(booking.email)}" style="color:#1d4ed8;text-decoration:none;">${esc(booking.email)}</a>`) : ''}
        ${booking.occasion ? row(t.occasion, esc(occasionLabel(booking.occasion, lang))) : ''}
        ${booking.comments ? row(t.comments, esc(booking.comments)) : ''}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="https://tablereserve.gr/admin" style="display:block;max-width:280px;margin:0 auto;background:#2563eb;color:#fff;padding:13px 20px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;text-align:center;white-space:nowrap;">${t.btn}</a>
      </div>
    </div>
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve | noreply@tablereserve.gr</p>
    </div>
  </div>
</body>
</html>` };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { shopId, bookingId } = JSON.parse(event.body || '{}');
    if (!shopId || !bookingId)
      return json(400, { error: 'shopId and bookingId are required' });

    const db = getDb();
    const bookingSnap = await db.ref(`reservations/${shopId}/${bookingId}`).get();
    if (!bookingSnap.exists())
      return json(200, { message: 'Booking not found' });

    const booking = bookingSnap.val();

    const emailSnap = await db.ref(`shop_profile/${shopId}/info/notificationEmail`).get();
    if (!emailSnap.exists() || !emailSnap.val())
      return json(200, { message: 'No notification email' });

    const notificationEmail = emailSnap.val();
    const details = (await db.ref(`shop_details/${shopId}`).get()).val() || {};
    const shopName = details.displayName || (shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, ' '));
    const lang = await shopLang(db, shopId, details);
    const mail = buildShopNewEmail({ booking, shopName, lang });
    await resend.emails.send({
      from: 'TableReserve <noreply@tablereserve.gr>',
      to: notificationEmail,
      subject: mail.subject,
      html: mail.html,
    });

    return json(200, { success: true, sentTo: notificationEmail });
  } catch (err) {
    console.error('Email error:', err);
    return json(500, { error: 'Email send failed', details: err.message });
  }
};

exports.buildShopNewEmail = buildShopNewEmail;
