const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Resend } = require('resend');
const { getDb } = require('../firebase');

/**
 * POST /v3/bookings
 * Η Google στέλνει νέα κράτηση — εμείς την αποθηκεύουμε στο Firebase
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // Validate required fields
    const required = ['merchant_id', 'service_id', 'start_sec', 'duration_sec', 'party_size', 'user_information'];
    for (const field of required) {
      if (!body[field]) {
        return res.status(400).json({
          error: { code: 400, message: `Missing required field: ${field}`, status: 'INVALID_ARGUMENT' }
        });
      }
    }

    const db = getDb();
    const merchantId = body.merchant_id;

    // Έλεγχος αν υπάρχει το μαγαζί
    const shopSnap = await db.ref(`shop_details/${merchantId}`).get();
    if (!shopSnap.exists()) {
      return res.status(404).json({
        error: { code: 404, message: `Merchant ${merchantId} not found`, status: 'NOT_FOUND' }
      });
    }

    // Μετατροπή Unix timestamp → ημερομηνία/ώρα
    const startDate = new Date(body.start_sec * 1000);
    const dateStr   = startDate.toISOString().split('T')[0];
    const timeStr   = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;

    // Έλεγχος διαθεσιμότητας
    const bookingsSnap = await db.ref(`reservations/${merchantId}`).get();
    let totalBookedAtSlot = 0;
    if (bookingsSnap.exists()) {
      bookingsSnap.forEach(child => {
        const b = child.val();
        if (b.date === dateStr && b.time === timeStr && b.status !== 'cancelled') {
          totalBookedAtSlot += parseInt(b.guests || 1);
        }
      });
    }

    const shopConfig   = shopSnap.val();
    const totalCap     = shopConfig.totalCapacity || 10;
    const requestedPax = parseInt(body.party_size);

    if (totalBookedAtSlot + requestedPax > totalCap) {
      return res.status(409).json({
        error: { code: 409, message: 'Requested slot is no longer available', status: 'ABORTED' },
        booking_failure: { cause: 'SLOT_UNAVAILABLE' }
      });
    }

    // Αποθήκευση στο Firebase
    const bookingId = body.booking_id || uuidv4();
    const userInfo  = body.user_information;

    const bookingData = {
      id:              bookingId,
      name:            `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
      phone:           userInfo.telephone || '',
      email:           userInfo.email     || '',
      date:            dateStr,
      time:            timeStr,
      guests:          String(requestedPax),
      location:        body.location_preference || 'Δεν έχω προτίμηση',
      occasion:        body.occasion || '',
      comments:        body.additional_data?.note || '',
      source:          'google',
      googleBookingId: bookingId,
      status:          'confirmed',
      timestamp:       Date.now(),
    };

    await db.ref(`reservations/${merchantId}/${bookingId}`).set(bookingData);
    console.log(`[bookings] Νέα κράτηση από Google: ${bookingId} @ ${merchantId} — ${dateStr} ${timeStr}`);

    // Email ειδοποίηση μέσω Resend
    try {
      const resendClient = new Resend(process.env.RESEND_API_KEY);
      const emailSnap = await db.ref(`shop_profile/${merchantId}/info/notificationEmail`).get();
      if (emailSnap.exists() && emailSnap.val()) {
        const shopName = shopConfig.displayName || merchantId.charAt(0).toUpperCase() + merchantId.slice(1).replace(/_/g, ' ');
        await resendClient.emails.send({
          from: 'TableReserve <noreply@tablereserve.gr>',
          to: emailSnap.val(),
          subject: `Νεα Κρατηση Google - ${shopName} | ${dateStr} ${timeStr} | ${bookingData.name}`,
          html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">🍽️</div>
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">Νεα Κρατηση</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">${shopName} &bull; μεσω Google Reserve</p>
    </div>
    <div style="background:#fff;padding:28px 32px;">
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:#1d4ed8;font-size:22px;font-weight:700;">${dateStr} &bull; ${timeStr}</p>
        <p style="margin:4px 0 0;color:#3b82f6;font-size:14px;">${requestedPax} ατομα</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;width:35%;">👤 Ονομα</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${bookingData.name || '-'}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">📞 Τηλεφωνο</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${bookingData.phone || '-'}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">✉️ Email</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${bookingData.email || '-'}</td>
        </tr>
        ${bookingData.comments ? `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">💬 Σχολια</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${bookingData.comments}</td>
        </tr>` : ''}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="https://tablereserve.gr/?shop=${merchantId}" style="display:inline-block;background:#2563eb;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">Δες τις Κρατησεις →</a>
      </div>
    </div>
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve &bull; noreply@tablereserve.gr</p>
    </div>
  </div>
</body>
</html>`
        });
        console.log(`[email] Εσταλη στο ${emailSnap.val()}`);
      }
    } catch (emailErr) {
      console.warn('[email] notification failed:', emailErr.message);
    }

    // Απάντηση στη Google
    res.status(200).json({
      booking: {
        booking_id:       bookingId,
        merchant_id:      merchantId,
        service_id:       body.service_id,
        start_sec:        body.start_sec,
        duration_sec:     body.duration_sec,
        party_size:       requestedPax,
        user_information: userInfo,
        status:           'CONFIRMED',
        create_time:      new Date().toISOString(),
      }
    });

  } catch (err) {
    console.error('[bookings POST] Error:', err);
    res.status(500).json({
      error: { code: 500, message: 'Internal server error', status: 'INTERNAL' }
    });
  }
});

/**
 * PATCH /v3/bookings/:bookingId
 * Ακύρωση ή τροποποίηση κράτησης από Google
 */
router.patch('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { merchant_id, status } = req.body;

    if (!merchant_id) {
      return res.status(400).json({
        error: { code: 400, message: 'merchant_id is required', status: 'INVALID_ARGUMENT' }
      });
    }

    const db = getDb();
    const bookingRef = db.ref(`reservations/${merchant_id}/${bookingId}`);
    const snap = await bookingRef.get();

    if (!snap.exists()) {
      return res.status(404).json({
        error: { code: 404, message: `Booking ${bookingId} not found`, status: 'NOT_FOUND' }
      });
    }

    const isCancelled = status === 'CANCELED';
    const updateData  = {
      status:      isCancelled ? 'cancelled' : 'confirmed',
      updatedAt:   Date.now(),
      ...(isCancelled && { cancelledBy: 'google', cancelledAt: Date.now() }),
    };

    await bookingRef.update(updateData);
    console.log(`[bookings] PATCH ${bookingId} → ${status}`);

    res.json({
      booking: {
        ...snap.val(),
        ...updateData,
        status:      status,
        update_time: new Date().toISOString(),
      }
    });

  } catch (err) {
    console.error('[bookings PATCH] Error:', err);
    res.status(500).json({
      error: { code: 500, message: 'Internal server error', status: 'INTERNAL' }
    });
  }
});

/**
 * GET /v3/bookings/:bookingId
 * Η Google ρωτά για κατάσταση συγκεκριμένης κράτησης
 */
router.get('/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { merchant_id } = req.query;

    if (!merchant_id) {
      return res.status(400).json({
        error: { code: 400, message: 'merchant_id query param required', status: 'INVALID_ARGUMENT' }
      });
    }

    const db   = getDb();
    const snap = await db.ref(`reservations/${merchant_id}/${bookingId}`).get();

    if (!snap.exists()) {
      return res.status(404).json({
        error: { code: 404, message: `Booking ${bookingId} not found`, status: 'NOT_FOUND' }
      });
    }

    const b = snap.val();
    const nameParts = (b.name || '').split(' ');

    res.json({
      booking: {
        booking_id:  bookingId,
        merchant_id: merchant_id,
        status:      b.status === 'cancelled' ? 'CANCELED' : 'CONFIRMED',
        party_size:  parseInt(b.guests),
        user_information: {
          given_name:  nameParts[0] || '',
          family_name: nameParts.slice(1).join(' ') || '',
          email:       b.email  || '',
          telephone:   b.phone  || '',
        },
      }
    });

  } catch (err) {
    console.error('[bookings GET] Error:', err);
    res.status(500).json({
      error: { code: 500, message: 'Internal server error', status: 'INTERNAL' }
    });
  }
});

module.exports = router;
