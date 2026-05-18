const express = require('express');
const router  = express.Router();
const { getDb } = require('../firebase');

/**
 * GET /feeds/merchants.xml
 *
 * Το feed που διαβάζει η Google για να ξέρει τα μαγαζιά σου.
 * Υποβάλλεις αυτό το URL στο Google Merchant Center / Reserve with Google.
 * Η Google το ανανεώνει κάθε 24 ώρες αυτόματα.
 *
 * ΣΗΜΑΝΤΙΚΟ: Κάθε μαγαζί χρειάζεται googlePlaceId στο Firebase:
 *   shop_details/{shopId}/googlePlaceId = "ChIJxxxxxxxxxxxxxxx"
 *   (βρίσκεται στο Google Maps > μαγαζί > Share > αντιγράφεις το CID)
 */
router.get('/merchants.xml', async (req, res) => {
  try {
    const db = getDb();

    const shopDetailsSnap = await db.ref('shop_details').get();

    if (!shopDetailsSnap.exists()) {
      return res.status(404).send('<error>No merchants found</error>');
    }

    const shops   = shopDetailsSnap.val();
    const baseUrl = process.env.BASE_URL || 'https://your-service.run.app';
    const locale  = process.env.LOCALE   || 'el';

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:g="http://base.google.com/ns/1.0"
      xmlns:reservewithgoogle="http://reservewithgoogle.com/ns/1.0">
  <title>TableReserve Merchant Feed</title>
  <link rel="self" href="${baseUrl}/feeds/merchants.xml"/>
  <updated>${new Date().toISOString()}</updated>
`;

    for (const [shopId, shop] of Object.entries(shops)) {
      const googlePlaceId = shop.googlePlaceId || '';

      if (!googlePlaceId) {
        console.warn(`[feed] Μαγαζί ${shopId} δεν έχει googlePlaceId — παραλείπεται`);
        continue;
      }

      const openHour  = shop.openHour  || 8;
      const closeHour = shop.closeHour || 23;
      const maxGuests = shop.maxGuests || shop.totalCapacity || 10;

      const days = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'];
      const hoursXml = days.map(day => `
    <reservewithgoogle:hours>
      <reservewithgoogle:open_day>${day}</reservewithgoogle:open_day>
      <reservewithgoogle:open_time>${formatHour(openHour)}</reservewithgoogle:open_time>
      <reservewithgoogle:close_time>${formatHour(closeHour)}</reservewithgoogle:close_time>
    </reservewithgoogle:hours>`).join('');

      xml += `
  <entry>
    <id>${shopId}</id>
    <title>${escapeXml(shop.displayName || shopId)}</title>
    <updated>${new Date().toISOString()}</updated>

    <!-- ✅ Merchant ID για Reserve with Google -->
    <reservewithgoogle:merchant_id>${shopId}</reservewithgoogle:merchant_id>

    <!-- ✅ Google Place ID (υποχρεωτικό) -->
    <reservewithgoogle:place_id>${googlePlaceId}</reservewithgoogle:place_id>

    <!-- ✅ Κατηγορία επιχείρησης -->
    <reservewithgoogle:category>DINING</reservewithgoogle:category>

    <!-- ✅ Γλώσσα -->
    <reservewithgoogle:locale>${locale}</reservewithgoogle:locale>

    <!-- ✅ Link για απευθείας κράτηση -->
    <reservewithgoogle:action_link>${baseUrl}/book?shop=${shopId}</reservewithgoogle:action_link>

    <!-- ✅ Υπηρεσία: κράτηση τραπεζιού -->
    <reservewithgoogle:service>
      <reservewithgoogle:service_id>table_reservation</reservewithgoogle:service_id>
      <reservewithgoogle:service_name>Κράτηση Τραπεζιού</reservewithgoogle:service_name>
      <reservewithgoogle:service_type>DINING</reservewithgoogle:service_type>
      <reservewithgoogle:duration_sec>5400</reservewithgoogle:duration_sec>
      <reservewithgoogle:min_party_size>1</reservewithgoogle:min_party_size>
      <reservewithgoogle:max_party_size>${maxGuests}</reservewithgoogle:max_party_size>
      <reservewithgoogle:availability_url>${baseUrl}/v3/availability?merchant_id=${shopId}</reservewithgoogle:availability_url>
      <reservewithgoogle:booking_url>${baseUrl}/v3/bookings</reservewithgoogle:booking_url>
    </reservewithgoogle:service>

    <!-- ✅ Ώρες λειτουργίας -->
    ${hoursXml}

  </entry>`;
    }

    xml += `\n</feed>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600'); // Cache 1 ώρα
    res.send(xml);

  } catch (err) {
    console.error('[feed] Error:', err);
    res.status(500).send('<error>Internal server error</error>');
  }
});

function escapeXml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

function formatHour(h) {
  return `${String(h).padStart(2, '0')}:00:00`;
}

module.exports = router;
