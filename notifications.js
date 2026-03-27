const express = require('express');
const router  = express.Router();
const { getDb } = require('../firebase');

/**
 * POST /v3/notifications
 *
 * Η Google μας ενημερώνει για events:
 *   - BOOKING_REMINDER: 24 ώρες πριν την κράτηση
 *   - BOOKING_CONFIRMED
 *   - BOOKING_CANCELED
 *
 * Εμείς ενημερώνουμε το Firebase αναλόγως.
 */
router.post('/', async (req, res) => {
  try {
    const { event_type, booking_id, merchant_id } = req.body;

    if (!event_type || !booking_id || !merchant_id) {
      return res.status(400).json({
        error: { code: 400, message: 'Missing required fields', status: 'INVALID_ARGUMENT' }
      });
    }

    const db = getDb();

    switch (event_type) {
      case 'BOOKING_REMINDER':
        // Σημείωσε ότι έχει σταλεί reminder
        await db.ref(`reservations/${merchant_id}/${booking_id}`).update({
          reminderSentAt: Date.now(),
        });
        console.log(`[notifications] Reminder για κράτηση ${booking_id} @ ${merchant_id}`);
        break;

      case 'BOOKING_CONFIRMED':
        await db.ref(`reservations/${merchant_id}/${booking_id}`).update({
          status: 'confirmed',
          confirmedAt: Date.now(),
        });
        break;

      case 'BOOKING_CANCELED':
        await db.ref(`reservations/${merchant_id}/${booking_id}`).update({
          status: 'cancelled',
          cancelledAt: Date.now(),
          cancelledBy: 'google',
        });
        break;

      default:
        console.log(`[notifications] Unknown event: ${event_type}`);
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
