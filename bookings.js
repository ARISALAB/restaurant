const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../firebase');

/**
 * POST /v3/bookings
 * Η Google στέλνει νέα κράτηση — εμείς την αποθηκεύουμε στο Firebase
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // Validate required fields (Google τα στέλνει πάντα αυτά)
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

    // Μετατροπή timestamp → ημερομηνία/ώρα
    const startDate = new Date(body.start_sec * 1000);
    const dateStr   = startDate.toISOString().split('T')[0];
    const timeStr   = `${String(startDate.getHours()).padStart(2,'0')}:${String(startDate.getMinutes()).padStart(2,'0')}`;

    // Έλεγχος διαθεσιμότητας
    const bookingsSnap = await db.ref(`reservations/${merchantId}`).get();
    let totalBookedAtSlot = 0;
    if (bookingsSnap.exists()) {
      bookingsSnap.forEach(child => {
        const b = child.val();
        if (b.date === dateStr && b.time === timeStr) {
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

    // Αποθήκευση στο Firebase (ίδια δομή με τις υπάρχουσες κρατήσεις)
    const bookingId  = uuidv4();
    const userInfo   = body.user_information;

    const bookingData = {
      id:          bookingId,
      name:        `${userInfo.given_name || ''} ${userInfo.family_name || ''}`.trim(),
      phone:       userInfo.telephone || '',
      email:       userInfo.email     || '',
      date:        dateStr,
      time:        timeStr,
      guests:      String(requestedPax),
      location:    body.location_preference || 'Δεν έχω προτίμηση',
      occasion:    body.occasion || '',
      comments:    body.additional_data?.note || '',
      source:      'google',           // ← ξέρουμε ότι ήρθε από Google
      googleBookingId: body.booking_id || bookingId,
      status:      'confirmed',
      timestamp:   Date.now(),
    };

    await db.ref(`reservations/${merchantId}/${bookingId}`).set(bookingData);

    // Επιστροφή στη Google (Google Booking API format)
    res.status(200).json({
      booking: {
        booking_id:   bookingId,
        merchant_id:  merchantId,
        service_id:   body.service_id,
        start_sec:    body.start_sec,
        duration_sec: body.duration_sec,
        party_size:   requestedPax,
        user_information: userInfo,
        status:       'CONFIRMED',
        create_time:  new Date().toISOString(),
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

    const updateData = {
      status:      status === 'CANCELED' ? 'cancelled' : 'confirmed',
      updatedAt:   Date.now(),
      cancelledBy: status === 'CANCELED' ? 'google' : null,
    };

    await bookingRef.update(updateData);

    res.json({
      booking: {
        ...snap.val(),
        status: status,
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
    res.json({
      booking: {
        booking_id:  bookingId,
        merchant_id: merchant_id,
        status:      b.status === 'cancelled' ? 'CANCELED' : 'CONFIRMED',
        party_size:  parseInt(b.guests),
        user_information: {
          given_name:  b.name?.split(' ')[0] || '',
          family_name: b.name?.split(' ').slice(1).join(' ') || '',
          email:       b.email,
          telephone:   b.phone,
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
