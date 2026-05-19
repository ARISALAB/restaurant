const express = require('express');
const router  = express.Router();
const { Resend } = require('resend');
const { getDb } = require('../firebase');
const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /v3/email/notify
 * Email ειδοποίηση στο μαγαζί για νέα κράτηση
 */
router.post('/notify', async (req, res) => {
  try {
    const { shopId, bookingId } = req.body;
    if (!shopId || !bookingId)
      return res.status(400).json({ error: 'shopId και bookingId απαιτούνται' });

    const db = getDb();
    const bookingSnap = await db.ref(`reservations/${shopId}/${bookingId}`).get();
    if (!bookingSnap.exists())
      return res.status(200).json({ message: 'Κράτηση δεν βρέθηκε' });

    const booking = bookingSnap.val();

    const emailSnap = await db.ref(`shop_profile/${shopId}/info/notificationEmail`).get();
    if (!emailSnap.exists() || !emailSnap.val())
      return res.status(200).json({ message: 'Δεν υπάρχει notification email' });

    const notificationEmail = emailSnap.val();
    const shopName = shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, ' ');

    await resend.emails.send({
      from: 'TableReserve <noreply@tablereserve.gr>',
      to: notificationEmail,
      subject: `Νεα Κρατηση - ${shopName} | ${booking.date || ''} ${booking.time || ''} | ${booking.name || ''}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">🍽️</div>
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Νεα Κρατηση</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">${shopName}</p>
    </div>
    <div style="background:#fff;padding:28px 32px;">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:#1d4ed8;font-size:22px;font-weight:700;">${booking.date || '-'} &bull; ${booking.time || '-'}</p>
        <p style="margin:4px 0 0;color:#3b82f6;font-size:14px;">${booking.guests || '-'} ατομα${booking.location ? ' | ' + booking.location : ''}</p>
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
        ${booking.comments ? `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">💬 Σχολια</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${booking.comments}</td>
        </tr>` : ''}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="https://tablereserve.gr/?shop=${shopId}" style="display:inline-block;background:#2563eb;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">
          Δες τις Κρατησεις →
        </a>
      </div>
    </div>
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve | noreply@tablereserve.gr</p>
    </div>
  </div>
</body>
</html>`
    });

    return res.status(200).json({ success: true, sentTo: notificationEmail });
  } catch (err) {
    console.error('Email error:', err);
    return res.status(500).json({ error: 'Αποτυχια αποστολης email', details: err.message });
  }
});

/**
 * POST /v3/email/notify-customer
 * Email επιβεβαίωσης στον πελάτη με κουμπί ακύρωσης (bilingual)
 */
router.post('/notify-customer', async (req, res) => {
  try {
    const { shopId, bookingId, cancelToken, lang } = req.body;
    if (!shopId || !bookingId || !cancelToken)
      return res.status(400).json({ error: 'shopId, bookingId, cancelToken απαιτούνται' });

    const db = getDb();
    const bookingSnap = await db.ref(`reservations/${shopId}/${bookingId}`).get();
    if (!bookingSnap.exists())
      return res.status(404).json({ error: 'Κράτηση δεν βρέθηκε' });

    const booking = bookingSnap.val();
    if (!booking.email)
      return res.status(200).json({ message: 'Χωρίς email πελάτη — παραλείφθηκε' });

    const shopSnap = await db.ref(`shop_details/${shopId}`).get();
    const shopName = shopSnap.exists()
      ? (shopSnap.val().displayName || shopId)
      : shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, ' ');

    const cancelUrl = `https://tablereserve.gr/cancel.html?token=${cancelToken}&shop=${shopId}&id=${bookingId}&lang=${lang || 'el'}`;

    // Κείμενα ανάλογα με τη γλώσσα
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
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${booking.location || txt.no_pref}</td>
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
</html>`
    });

    console.log(`[notify-customer] Email εστάλη στο ${booking.email} (lang: ${lang || 'el'})`);
    return res.status(200).json({ success: true, sentTo: booking.email });
  } catch (err) {
    console.error('[notify-customer] error:', err);
    return res.status(500).json({ error: 'Αποτυχία αποστολής', details: err.message });
  }
});

/**
 * POST /v3/email/cancel
 * Ακύρωση κράτησης μέσω token — public endpoint (χωρίς auth)
 */
router.post('/cancel', async (req, res) => {
  try {
    const { token, shopId, bookingId } = req.body;
    if (!token || !shopId || !bookingId)
      return res.status(400).json({ error: 'token, shopId, bookingId απαιτούνται' });

    const db = getDb();
    const bookingRef = db.ref(`reservations/${shopId}/${bookingId}`);
    const snap = await bookingRef.get();

    if (!snap.exists())
      return res.status(404).json({ error: 'Κράτηση δεν βρέθηκε' });

    const booking = snap.val();

    // Έλεγχος token
    if (booking.cancelToken !== token)
      return res.status(403).json({ error: 'Μη έγκυρο token ακύρωσης' });

    // Ήδη ακυρωμένη
    if (booking.status === 'cancelled')
      return res.status(200).json({ alreadyCancelled: true, message: 'Η κράτηση είναι ήδη ακυρωμένη' });

    // Έλεγχος χρόνου — απαγόρευση εντός 2 ωρών
    const bookingDateTime = new Date(`${booking.date}T${booking.time}:00`);
    const now = new Date();
    const diffHours = (bookingDateTime - now) / (1000 * 60 * 60);
    if (diffHours < 2)
      return res.status(400).json({
        error: 'too_late',
        message: 'Η ακύρωση δεν επιτρέπεται εντός 2 ωρών από την κράτηση'
      });

    // Ακύρωση στο Firebase
    await bookingRef.update({
      status:      'cancelled',
      cancelledAt: Date.now(),
      cancelledBy: 'customer',
    });
    console.log(`[cancel] Κράτηση ${bookingId} @ ${shopId} ακυρώθηκε από πελάτη`);

    // Email ειδοποίηση στο μαγαζί
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
        <a href="https://tablereserve.gr/?shop=${shopId}"
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
</html>`
        });
        console.log(`[cancel] Ειδοποίηση μαγαζιού εστάλη στο ${emailSnap.val()}`);
      }
    } catch (emailErr) {
      console.warn('[cancel] shop email failed:', emailErr.message);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[cancel] error:', err);
    return res.status(500).json({ error: 'Σφάλμα ακύρωσης', details: err.message });
  }
});

module.exports = router;
