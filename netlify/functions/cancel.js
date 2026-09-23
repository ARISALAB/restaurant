const { Resend } = require('resend');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { token, shopId, bookingId } = JSON.parse(event.body || '{}');
    if (!token || !shopId || !bookingId)
      return json(400, { error: 'token, shopId, bookingId απαιτούνται' });

    const db = getDb();
    const bookingRef = db.ref(`reservations/${shopId}/${bookingId}`);
    const snap = await bookingRef.get();

    if (!snap.exists())
      return json(404, { error: 'Κράτηση δεν βρέθηκε' });

    const booking = snap.val();

    if (booking.cancelToken !== token)
      return json(403, { error: 'Μη έγκυρο token ακύρωσης' });

    if (booking.status === 'cancelled')
      return json(200, { alreadyCancelled: true, message: 'Η κράτηση είναι ήδη ακυρωμένη' });

    const bookingDateTime = new Date(`${booking.date}T${booking.time}:00`);
    const now = new Date();
    const diffHours = (bookingDateTime - now) / (1000 * 60 * 60);
    if (diffHours < 2)
      return json(400, {
        error: 'too_late',
        message: 'Η ακύρωση δεν επιτρέπεται εντός 2 ωρών από την κράτηση',
      });

    await bookingRef.update({
      status:      'cancelled',
      cancelledAt: Date.now(),
      cancelledBy: 'customer',
    });

    try {
      const emailSnap = await db.ref(`shop_profile/${shopId}/info/notificationEmail`).get();
      const shopSnap  = await db.ref(`shop_details/${shopId}`).get();
      const shopName  = shopSnap.exists()
        ? (shopSnap.val().displayName || shopId)
        : shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, ' ');

      if (emailSnap.exists() && emailSnap.val()) {
        await resend.emails.send({
          from: 'TableReserve <noreply@tablereserve.gr>',
          to: emailSnap.val(),
          subject: `❌ Ακύρωση Κράτησης - ${shopName} | ${booking.date} ${booking.time} | ${booking.name}`,
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:#ef4444;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">❌</div>
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Ακύρωση Κράτησης</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">${shopName} &bull; από πελάτη</p>
    </div>
    <div style="background:#fff;padding:28px 32px;">
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:#991b1b;font-size:22px;font-weight:700;">${booking.date} &bull; ${booking.time}</p>
        <p style="margin:4px 0 0;color:#ef4444;font-size:14px;">${booking.guests} άτομα</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;width:35%;">👤 Ονομα</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${booking.name || '-'}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">📞 Τηλεφωνο</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${booking.phone || '-'}</td>
        </tr>
        ${booking.email ? `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">✉️ Email</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${booking.email}</td>
        </tr>` : ''}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="https://tablereserve.gr/admin"
           style="display:inline-block;background:#2563eb;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">
          Δες τις Κρατησεις →
        </a>
      </div>
    </div>
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve &bull; noreply@tablereserve.gr</p>
    </div>
  </div>
</body>
</html>`,
        });
      }
    } catch (emailErr) {
      console.warn('[cancel] shop email failed:', emailErr.message);
    }

    return json(200, { success: true });
  } catch (err) {
    console.error('[cancel] error:', err);
    return json(500, { error: 'Σφάλμα ακύρωσης', details: err.message });
  }
};
