const express  = require('express');
const router   = express.Router();
const nodemailer = require('nodemailer');
const { getDb } = require('../firebase');

// Gmail OAuth2 transporter
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GMAIL_REFRESH_TOKEN
});

async function createTransporter() {
  const accessToken = await oauth2Client.getAccessToken();
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: process.env.GMAIL_USER,
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      accessToken: accessToken.token,
    }
  });
}

/**
 * POST /v3/email/notify
 * Στέλνει email ειδοποίηση για νέα κράτηση
 * Body: { shopId, bookingId }
 */
router.post('/notify', async (req, res) => {
  try {
    const { shopId, bookingId } = req.body;

    if (!shopId || !bookingId) {
      return res.status(400).json({ error: 'shopId και bookingId απαιτούνται' });
    }

    const db = getDb();

    // Φόρτωσε κράτηση
    const bookingSnap = await db.ref(`reservations/${shopId}/${bookingId}`).get();
    if (!bookingSnap.exists()) {
      return res.status(404).json({ error: 'Κράτηση δεν βρέθηκε' });
    }
    const booking = bookingSnap.val();

    // Φόρτωσε notification email μαγαζιού
    const emailSnap = await db.ref(`shop_profile/${shopId}/info/notificationEmail`).get();
    if (!emailSnap.exists() || !emailSnap.val()) {
      return res.status(200).json({ message: 'Δεν υπάρχει notification email για αυτό το μαγαζί' });
    }
    const notificationEmail = emailSnap.val();

    // Φόρτωσε όνομα μαγαζιού
    const shopNameSnap = await db.ref(`shop_profile/${shopId}/info/tagline`).get();
    const shopName = shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, ' ');

    // Φόρτωσε source label
    const sourceLabel = booking.source === 'google' ? '🔵 Google Reserve' : '🌐 TableReserve';

    // Στείλε email
    const mailOptions = {
      from: `"TableReserve" <${process.env.GMAIL_USER}>`,
      to: notificationEmail,
      subject: `📅 Νέα Κράτηση — ${booking.name} — ${booking.date} ${booking.time}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f8f9fa; padding: 20px;">
          
          <div style="background: #1A3C8F; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">📅 Νέα Κράτηση!</h1>
            <p style="color: #cce0ff; margin: 5px 0 0 0;">${shopName}</p>
          </div>

          <div style="background: white; padding: 24px; border-radius: 0 0 8px 8px;">
            
            <div style="background: #f0f4ff; border-left: 4px solid #1A3C8F; padding: 12px 16px; margin-bottom: 20px; border-radius: 0 4px 4px 0;">
              <p style="margin: 0; color: #1A3C8F; font-weight: bold;">${sourceLabel}</p>
            </div>

            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; color: #666; width: 40%;">👤 Όνομα</td>
                <td style="padding: 10px 0; font-weight: bold; color: #1a1a1a;">${booking.name || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; color: #666;">📞 Τηλέφωνο</td>
                <td style="padding: 10px 0; font-weight: bold; color: #1a1a1a;">${booking.phone || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; color: #666;">📧 Email</td>
                <td style="padding: 10px 0; font-weight: bold; color: #1a1a1a;">${booking.email || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; color: #666;">📅 Ημερομηνία</td>
                <td style="padding: 10px 0; font-weight: bold; color: #1a1a1a;">${booking.date || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; color: #666;">🕐 Ώρα</td>
                <td style="padding: 10px 0; font-weight: bold; color: #1a1a1a;">${booking.time || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; color: #666;">👥 Άτομα</td>
                <td style="padding: 10px 0; font-weight: bold; color: #1a1a1a;">${booking.guests || '-'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; color: #666;">🪑 Θέση</td>
                <td style="padding: 10px 0; font-weight: bold; color: #1a1a1a;">${booking.location || '-'}</td>
              </tr>
              ${booking.occasion ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px 0; color: #666;">🎉 Περίσταση</td>
                <td style="padding: 10px 0; font-weight: bold; color: #1a1a1a;">${booking.occasion}</td>
              </tr>` : ''}
              ${booking.comments ? `
              <tr>
                <td style="padding: 10px 0; color: #666;">💬 Σχόλια</td>
                <td style="padding: 10px 0; font-weight: bold; color: #1a1a1a;">${booking.comments}</td>
              </tr>` : ''}
            </table>

            <div style="margin-top: 24px; text-align: center;">
              <a href="https://restableres.netlify.app/?shop=${shopId}" 
                 style="background: #1A3C8F; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                Δες τις Κρατήσεις →
              </a>
            </div>

          </div>

          <p style="text-align: center; color: #999; font-size: 12px; margin-top: 16px;">
            TableReserve · restableres.netlify.app
          </p>
        </div>
      `
    };

    const transporter = await createTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`[email] ✅ Εστάλη σε ${notificationEmail} για κράτηση ${bookingId} @ ${shopId}`);

    res.json({ success: true, sentTo: notificationEmail });

  } catch (err) {
    console.error('[email] Error:', err);
    res.status(500).json({ error: 'Σφάλμα αποστολής email', details: err.message });
  }
});

module.exports = router;
