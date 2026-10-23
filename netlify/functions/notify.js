// Email στο κατάστημα για κάθε νέα κράτηση, στη γλώσσα του καταστήματος (shop_details/{shop}/lang)
const { Resend } = require('resend');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { locationLabel } = require('./_shared/location');

const resend = new Resend(process.env.RESEND_API_KEY);

const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    const en = details.lang === 'en';
    const t = en ? {
      subject: 'New booking', head: 'New booking', persons: 'guests',
      name: '👤 Name', phone: '📞 Phone', comments: '💬 Comments', btn: 'View bookings →'
    } : {
      subject: 'Νέα κράτηση', head: 'Νέα κράτηση', persons: 'άτομα',
      name: '👤 Όνομα', phone: '📞 Τηλέφωνο', comments: '💬 Σχόλια', btn: 'Δείτε τις κρατήσεις →'
    };
    const loc = locationLabel(booking.location, en ? 'en' : 'el');
    const row = (l, v) => `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;width:35%;">${l}</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${v}</td>
        </tr>`;

    await resend.emails.send({
      from: 'TableReserve <noreply@tablereserve.gr>',
      to: notificationEmail,
      subject: `${t.subject} - ${shopName} | ${booking.date || ''} ${booking.time || ''} | ${booking.name || ''}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">🍽️</div>
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${t.head}</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">${esc(shopName)}</p>
    </div>
    <div style="background:#fff;padding:28px 32px;">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:#1d4ed8;font-size:22px;font-weight:700;">${esc(booking.date || '-')} &bull; ${esc(booking.time || '-')}</p>
        <p style="margin:4px 0 0;color:#3b82f6;font-size:14px;">${esc(booking.guests || '-')} ${t.persons}${loc ? ' | ' + esc(loc) : ''}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${row(t.name, esc(booking.name || '-'))}
        ${row(t.phone, esc(booking.phone || '-'))}
        ${booking.email ? row('✉️ Email', esc(booking.email)) : ''}
        ${booking.comments ? row(t.comments, esc(booking.comments)) : ''}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="https://tablereserve.gr/admin" style="display:inline-block;background:#2563eb;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">
          ${t.btn}
        </a>
      </div>
    </div>
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve | noreply@tablereserve.gr</p>
    </div>
  </div>
</body>
</html>`,
    });

    return json(200, { success: true, sentTo: notificationEmail });
  } catch (err) {
    console.error('Email error:', err);
    return json(500, { error: 'Email send failed', details: err.message });
  }
};
