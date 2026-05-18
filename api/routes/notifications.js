const express = require('express');
const router  = express.Router();
const { getDb } = require('../firebase');

/**
 * POST /v3/notifications
 *
 * Η Google μας ενημερώνει για events:
 *   - BOOKING_REMINDER  : 24 ώρες πριν την κράτηση
 *   - BOOKING_CONFIRMED : κράτηση επιβεβαιώθηκε
 *   - BOOKING_CANCELED  : κράτηση ακυρώθηκε
 *
 * Εμείς ενημερώνουμε το Firebase αναλόγως.
 */
router.post('/', async (req, res) => {
  try {
    const { event_type, booking_id, merchant_id } = req.body;

    if (!event_type || !booking_id || !merchant_id) {
      return res.status(400).json({
        error: { code: 400, message: 'Missing required fields: event_type, booking_id, merchant_id', status: 'INVALID_ARGUMENT' }
      });
    }

    const db  = getDb();
    const ref = db.ref(`reservations/${merchant_id}/${booking_id}`);

    // Έλεγχος ότι υπάρχει η κράτηση
    const snap = await ref.get();
    if (!snap.exists()) {
      console.warn(`[notifications] Κράτηση ${booking_id} δεν βρέθηκε @ ${merchant_id}`);
      // Επιστρέφουμε 200 παρόλα αυτά — η Google το απαιτεί
      return res.status(200).json({});
    }

    switch (event_type) {
      case 'BOOKING_REMINDER':
        await ref.update({ reminderSentAt: Date.now() });
        console.log(`[notifications] ⏰ Reminder για ${booking_id} @ ${merchant_id}`);
        break;

      case 'BOOKING_CONFIRMED':
        await ref.update({ status: 'confirmed', confirmedAt: Date.now() });
        console.log(`[notifications] ✅ Confirmed ${booking_id} @ ${merchant_id}`);
        break;

      case 'BOOKING_CANCELED':
        await ref.update({
          status:      'cancelled',
          cancelledAt: Date.now(),
          cancelledBy: 'google',
        });
        console.log(`[notifications] ❌ Cancelled ${booking_id} @ ${merchant_id}`);
        break;

      default:
        console.log(`[notifications] ⚠️ Unknown event_type: ${event_type}`);
    }

    // Η Google περιμένει 200 OK με άδειο body
    res.status(200).json({});

  } catch (err) {
    console.error('[notifications] Error:', err);
    res.status(500).json({
      error: { code: 500, message: 'Internal server error', status: 'INTERNAL' }
    });
  }
});

module.exports = router;
