const { Resend } = require('resend');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { locationLabel } = require('./_shared/location');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { shopId, bookingId, cancelToken, lang } = JSON.parse(event.body || '{}');
    if (!shopId || !bookingId || !cancelToken)
      return json(400, { error: 'shopId, bookingId, cancelToken απαιτούνται' });

    const db = getDb();
    const bookingSnap = await db.ref(`reservations/${shopId}/${bookingId}`).get();
    if (!bookingSnap.exists())
      return json(404, { error: 'Κράτηση δεν βρέθηκε' });

    const booking = bookingSnap.val();
    if (!booking.email)
      return json(200, { message: 'Χωρίς email πελάτη — παραλείφθηκε' });

    const shopSnap = await db.ref(`shop_details/${shopId}`).get();
    const shopName = shopSnap.exists()
      ? (shopSnap.val().displayName || shopId)
      : shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, ' ');

    const cancelUrl = `https://tablereserve.gr/cancel.html?token=${cancelToken}&shop=${shopId}&id=${bookingId}&lang=${lang || 'el'}`;

    const isEn = lang === 'en';
    const txt = isEn ? {
      subject:      `✅ Booking Confirmation - ${shopName} | ${booking.date} ${booking.time}`,
      header:       'Booking Confirmation',
      greeting:     `Dear <strong>${booking.name}</strong>,`,
      confirmed:    'Your reservation has been confirmed!',
      persons:      'persons',
      location_lbl: '📍 Seating',
      occasion_lbl: '🎉 Occasion',
      comments_lbl: '💬 Requests',
      no_pref:      'No preference',
      cancel_q:     'Would you like to cancel your reservation?',
      cancel_btn:   '❌ Cancel Reservation',
      cancel_note:  'Cancellation is allowed up to 2 hours before the reservation',
      footer:       'TableReserve &bull; noreply@tablereserve.gr',
    } : {
      subject:      `✅ Επιβεβαίωση Κράτησης - ${shopName} | ${booking.date} ${booking.time}`,
      header:       'Επιβεβαίωση Κράτησης',
      greeting:     `Αγαπητέ/ή <strong>${booking.name}</strong>,`,
      confirmed:    'Η κράτησή σας επιβεβαιώθηκε με επιτυχία!',
      persons:      'άτομα',
      location_lbl: '📍 Χώρος',
      occasion_lbl: '🎉 Γεγονός',
      comments_lbl: '💬 Αιτήματα',
      no_pref:      'Δεν έχω προτίμηση',
      cancel_q:     'Θέλετε να ακυρώσετε την κράτησή σας;',
      cancel_btn:   '❌ Ακύρωση Κράτησης',
      cancel_note:  'Η ακύρωση επιτρέπεται έως 2 ώρες πριν την κράτηση',
      footer:       'TableReserve &bull; noreply@tablereserve.gr',
    };

    await resend.emails.send({
      from: 'TableReserve <noreply@tablereserve.gr>',
      to: booking.email,
      subject: txt.subject,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;">

    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">🍽️</div>
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${txt.header}</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">${shopName}</p>
    </div>

    <div style="background:#fff;padding:28px 32px;">
      <p style="color:#1e293b;font-size:15px;margin-bottom:4px;">${txt.greeting}</p>
      <p style="color:#64748b;font-size:14px;margin-bottom:24px;">${txt.confirmed}</p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:#1d4ed8;font-size:22px;font-weight:700;">${booking.date} &bull; ${booking.time}</p>
        <p style="margin:4px 0 0;color:#3b82f6;font-size:14px;">${booking.guests} ${txt.persons} &bull; ${shopName}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;width:40%;">${txt.location_lbl}</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${locationLabel(booking.location, lang) || txt.no_pref}</td>
        </tr>
        ${booking.occasion ? `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">${txt.occasion_lbl}</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${booking.occasion}</td>
        </tr>` : ''}
        ${booking.comments ? `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">${txt.comments_lbl}</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${booking.comments}</td>
        </tr>` : ''}
      </table>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;text-align:center;">
        <p style="color:#991b1b;font-size:13px;font-weight:600;margin:0 0 12px;">${txt.cancel_q}</p>
        <a href="${cancelUrl}"
           style="display:inline-block;background:#ef4444;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;">
          ${txt.cancel_btn}
        </a>
        <p style="color:#94a3b8;font-size:11px;margin:12px 0 0;">${txt.cancel_note}</p>
      </div>
    </div>

    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">${txt.footer}</p>
    </div>

  </div>
</body>
</html>`,
    });

    return json(200, { success: true, sentTo: booking.email });
  } catch (err) {
    console.error('[notify-customer] error:', err);
    return json(500, { error: 'Αποτυχία αποστολής', details: err.message });
  }
};
