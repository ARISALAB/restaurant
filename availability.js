const express = require('express');
const router  = express.Router();
const { getDb } = require('../firebase');

/**
 * GET /v3/availability
 *
 * Η Google στέλνει:
 *   ?merchant_id=kafeneio_athens
 *   &start_time_sec=1711497600   (Unix timestamp)
 *   &end_time_sec=1711584000
 *
 * Εμείς επιστρέφουμε τις ελεύθερες ώρες σε Google format.
 */
router.get('/', async (req, res) => {
  try {
    const { merchant_id, start_time_sec, end_time_sec } = req.query;

    if (!merchant_id || !start_time_sec || !end_time_sec) {
      return res.status(400).json({
        error: { code: 400, message: 'merchant_id, start_time_sec, end_time_sec are required', status: 'INVALID_ARGUMENT' }
      });
    }

    const db = getDb();

    // Φόρτωσε τις ρυθμίσεις του μαγαζιού
    const shopSnap = await db.ref(`shop_details/${merchant_id}`).get();
    if (!shopSnap.exists()) {
      return res.status(404).json({
        error: { code: 404, message: `Merchant ${merchant_id} not found`, status: 'NOT_FOUND' }
      });
    }
    const shopConfig = shopSnap.val();

    // Φόρτωσε υπάρχουσες κρατήσεις για αυτό το διάστημα
    const startDate = new Date(parseInt(start_time_sec) * 1000);
    const endDate   = new Date(parseInt(end_time_sec)   * 1000);

    const bookingsSnap = await db.ref(`reservations/${merchant_id}`).get();
    const existingBookings = [];
    if (bookingsSnap.exists()) {
      bookingsSnap.forEach(child => {
        existingBookings.push(child.val());
      });
    }

    // Παράγε slots για κάθε μέρα στο διάστημα
    const slots = generateSlots(startDate, endDate, existingBookings, shopConfig);

    // Google Booking API format
    res.json({
      slots: slots.map(slot => ({
        merchant_id:     merchant_id,
        service_id:      'table_reservation',
        start_sec:       slot.start_sec,
        duration_sec:    slot.duration_sec,   // 90 λεπτά = 5400 δευτερόλεπτα
        availability_tag: slot.tag,
        spot_open_count: slot.available_spots,
        spot_total_count: shopConfig.totalCapacity || 10,
      }))
    });

  } catch (err) {
    console.error('[availability] Error:', err);
    res.status(500).json({
      error: { code: 500, message: 'Internal server error', status: 'INTERNAL' }
    });
  }
});

/**
 * Παράγει διαθέσιμα slots ανάμεσα σε startDate και endDate
 * λαμβάνοντας υπόψη τις υπάρχουσες κρατήσεις
 */
function generateSlots(startDate, endDate, existingBookings, shopConfig) {
  const slots = [];
  const SLOT_DURATION_SEC = 5400; // 90 λεπτά
  const OPEN_HOUR  = shopConfig.openHour  || 8;
  const CLOSE_HOUR = shopConfig.closeHour || 23;
  const TOTAL_CAPACITY = shopConfig.totalCapacity || 10;

  // Χάρτης κρατήσεων: "YYYY-MM-DD HH:MM" -> πλήθος ατόμων
  const bookedMap = {};
  existingBookings.forEach(b => {
    const key = `${b.date} ${b.time}`;
    bookedMap[key] = (bookedMap[key] || 0) + parseInt(b.guests || 1);
  });

  const current = new Date(startDate);
  current.setHours(OPEN_HOUR, 0, 0, 0);

  while (current <= endDate) {
    const hour = current.getHours();
    if (hour >= OPEN_HOUR && hour < CLOSE_HOUR) {
      const dateStr = current.toISOString().split('T')[0];
      const timeStr = `${String(hour).padStart(2,'0')}:${current.getMinutes() === 0 ? '00' : '30'}`;
      const key = `${dateStr} ${timeStr}`;

      const bookedGuests = bookedMap[key] || 0;
      const availableSpots = Math.max(0, TOTAL_CAPACITY - bookedGuests);

      slots.push({
        start_sec:       Math.floor(current.getTime() / 1000),
        duration_sec:    SLOT_DURATION_SEC,
        available_spots: availableSpots,
        tag:             availableSpots > 0 ? 'AVAILABLE' : 'FULL',
      });
    }

    // +30 λεπτά
    current.setMinutes(current.getMinutes() + 30);
    if (current.getHours() >= CLOSE_HOUR) {
      current.setDate(current.getDate() + 1);
      current.setHours(OPEN_HOUR, 0, 0, 0);
    }
  }

  return slots;
}

module.exports = router;
