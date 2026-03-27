const express = require('express');
const router  = express.Router();
const { getDb } = require('../firebase');

/**
 * GET /feeds/merchants.xml
 *
 * Το feed που "τρώει" η Google για να ξέρει τα μαγαζιά σου.
 * Υποβάλλεις αυτό το URL στο Google Merchant Center.
 *
 * Η Google το ανανεώνει κάθε 24 ώρες αυτόματα.
 * ΣΗΜΑΝΤΙΚΟ: Κάθε μαγαζί χρειάζεται Google Place ID
 *            (βρίσκεται στο Google Maps > μαγαζί > "Share" > CID)
 */
router.get('/merchants.xml', async (req, res) => {
  try {
    const db = getDb();

    // Φόρτωσε λεπτομέρειες μαγαζιών
    const [shopDetailsSnap, usersToShopsSnap] = await Promise.all([
      db.ref('shop_details').get(),
      db.ref('users_to_shops').get(),
    ]);

    if (!shopDetailsSnap.exists()) {
      return res.status(404).send('<error>No merchants found</error>');
    }

    const shops   = shopDetailsSnap.val();
    const baseUrl = process.env.BASE_URL || 'https://your-service.run.app';

    // Παράγε XML κατά Google Feeds format
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

      xml += `
  <entry>
    <id>${shopId}</id>
    <title>${escapeXml(shop.displayName || shopId)}</title>
    <reservewithgoogle:merchant_id>${shopId}</reservewithgoogle:merchant_id>

    <!-- Google Place ID: βρες το στο Google Maps για κάθε μαγαζί -->
    <reservewithgoogle:place_id>${googlePlaceId}</reservewithgoogle:place_id>

    <!-- Υπηρεσία: κράτηση τραπεζιού -->
    <reservewithgoogle:service>
      <reservewithgoogle:service_id>table_reservation</reservewithgoogle:service_id>
      <reservewithgoogle:service_name>Κράτηση Τραπεζιού</reservewithgoogle:service_name>
      <reservewithgoogle:service_type>DINING</reservewithgoogle:service_type>
      <reservewithgoogle:duration_sec>5400</reservewithgoogle:duration_sec>
      <reservewithgoogle:min_party_size>1</reservewithgoogle:min_party_size>
      <reservewithgoogle:max_party_size>${shop.maxGuests || 10}</reservewithgoogle:max_party_size>
      <reservewithgoogle:availability_url>${baseUrl}/v3/availability?merchant_id=${shopId}</reservewithgoogle:availability_url>
      <reservewithgoogle:booking_url>${baseUrl}/v3/bookings</reservewithgoogle:booking_url>
    </reservewithgoogle:service>

    <!-- Ώρες λειτουργίας -->
    <reservewithgoogle:hours>
      <reservewithgoogle:open_day>MONDAY</reservewithgoogle:open_day>
      <reservewithgoogle:open_time>${formatHour(shop.openHour || 8)}</reservewithgoogle:open_time>
      <reservewithgoogle:close_time>${formatHour(shop.closeHour || 23)}</reservewithgoogle:close_time>
    </reservewithgoogle:hours>
    <reservewithgoogle:hours>
      <reservewithgoogle:open_day>TUESDAY</reservewithgoogle:open_day>
      <reservewithgoogle:open_time>${formatHour(shop.openHour || 8)}</reservewithgoogle:open_time>
      <reservewithgoogle:close_time>${formatHour(shop.closeHour || 23)}</reservewithgoogle:close_time>
    </reservewithgoogle:hours>
    <reservewithgoogle:hours>
      <reservewithgoogle:open_day>WEDNESDAY</reservewithgoogle:open_day>
      <reservewithgoogle:open_time>${formatHour(shop.openHour || 8)}</reservewithgoogle:open_time>
      <reservewithgoogle:close_time>${formatHour(shop.closeHour || 23)}</reservewithgoogle:close_time>
    </reservewithgoogle:hours>
    <reservewithgoogle:hours>
      <reservewithgoogle:open_day>THURSDAY</reservewithgoogle:open_day>
      <reservewithgoogle:open_time>${formatHour(shop.openHour || 8)}</reservewithgoogle:open_time>
      <reservewithgoogle:close_time>${formatHour(shop.closeHour || 23)}</reservewithgoogle:close_time>
    </reservewithgoogle:hours>
    <reservewithgoogle:hours>
      <reservewithgoogle:open_day>FRIDAY</reservewithgoogle:open_day>
      <reservewithgoogle:open_time>${formatHour(shop.openHour || 8)}</reservewithgoogle:open_time>
      <reservewithgoogle:close_time>${formatHour(shop.closeHour || 23)}</reservewithgoogle:close_time>
    </reservewithgoogle:hours>
    <reservewithgoogle:hours>
      <reservewithgoogle:open_day>SATURDAY</reservewithgoogle:open_day>
      <reservewithgoogle:open_time>${formatHour(shop.openHour || 8)}</reservewithgoogle:open_time>
      <reservewithgoogle:close_time>${formatHour(shop.closeHour || 23)}</reservewithgoogle:close_time>
    </reservewithgoogle:hours>
    <reservewithgoogle:hours>
      <reservewithgoogle:open_day>SUNDAY</reservewithgoogle:open_day>
      <reservewithgoogle:open_time>${formatHour(shop.openHour || 8)}</reservewithgoogle:open_time>
      <reservewithgoogle:close_time>${formatHour(shop.closeHour || 23)}</reservewithgoogle:close_time>
    </reservewithgoogle:hours>

    <updated>${new Date().toISOString()}</updated>
  </entry>`;
    }

    xml += `\n</feed>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);

  } catch (err) {
    console.error('[feed] Error:', err);
    res.status(500).send('<error>Internal server error</error>');
  }
});

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatHour(h) {
  return `${String(h).padStart(2, '0')}:00:00`;
}

module.exports = router;
