// Merchant feed για Google (Reserve with Google / Business Link)
//
// Στοιχεία ανά μαγαζί (τα γράφει μόνο ο superadmin):
//   shop_details/<id>/google = {
//     placeId, street, postalCode, city, country, lat, lng,
//     verified: true|false, updatedAt
//   }
//
// Στο feed μπαίνουν μόνο μαγαζιά που:
//   - είναι ενεργά (όχι pending/closed, συνδρομή σε ισχύ)
//   - έχουν πλήρη στοιχεία Google και τα έχει επαληθεύσει ο superadmin
//
// Μορφή: Actions Center Merchants feed (JSON), ενιαίο αρχείο (PROCESS_AS_COMPLETE).

const BASE_URL = 'https://tablereserve.gr/';

const REQUIRED = [
  ['placeId',    'Place ID'],
  ['street',     'Οδός & αριθμός'],
  ['postalCode', 'ΤΚ'],
  ['city',       'Πόλη'],
  ['lat',        'Γεωγρ. πλάτος'],
  ['lng',        'Γεωγρ. μήκος'],
];

// Τηλέφωνο σε διεθνή μορφή (+30...) όπου γίνεται
function intlPhone(p) {
  let d = String(p || '').replace(/[^\d+]/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (d.startsWith('+')) return d;
  if (/^(2|6)\d{9}$/.test(d)) return '+30' + d;
  if (/^30(2|6)\d{9}$/.test(d)) return '+' + d;
  return d;
}

function bookingUrl(shopId, details, params) {
  const base = details.slug ? BASE_URL + details.slug : BASE_URL + '?shop=' + encodeURIComponent(shopId);
  const q = new URLSearchParams(params).toString();
  return base + (base.includes('?') ? '&' : '?') + q;
}

function isActive(details, now) {
  if (!details) return false;
  if (details.status === 'pending' || details.status === 'closed') return false;
  if (details.paidUntil && details.paidUntil < now) return false;
  return true;
}

// Τι λείπει για να μπει ένα μαγαζί στο feed (κενή λίστα = έτοιμο)
function missingFor(details, now = Date.now()) {
  const g = (details && details.google) || {};
  const missing = [];
  if (!isActive(details, now)) missing.push('Ανενεργό κατάστημα');
  if (!details || !details.displayName) missing.push('Όνομα');
  REQUIRED.forEach(([k, label]) => {
    const v = g[k];
    if (v === undefined || v === null || v === '') missing.push(label);
  });
  if (typeof g.lat === 'number' && (g.lat < -90 || g.lat > 90)) missing.push('Σωστό γεωγρ. πλάτος');
  if (typeof g.lng === 'number' && (g.lng < -180 || g.lng > 180)) missing.push('Σωστό γεωγρ. μήκος');
  if (!g.verified) missing.push('Επαλήθευση στο Maps');
  return missing;
}

function merchantFor(shopId, details, info) {
  const g = details.google;
  const m = {
    merchant_id: shopId,
    name: details.displayName,
    url: bookingUrl(shopId, details, { src: 'google' }),
    category: 'restaurant',
    geo: {
      latitude: Number(g.lat),
      longitude: Number(g.lng),
      address: {
        country: (g.country || 'GR').toUpperCase(),
        locality: g.city,
        postal_code: String(g.postalCode).replace(/\s+/g, ' ').trim(),
        street_address: g.street,
      },
    },
    matching_hints: { place_id: g.placeId },
    action_link: [
      {
        url: bookingUrl(shopId, details, { src: 'google', lang: 'el' }),
        language: 'el',
        platform: 'ACTION_PLATFORM_WEB_APPLICATION',
        action_link_type: 'ACTION_LINK_TYPE_MAKE_DINING_RESERVATION',
      },
      {
        url: bookingUrl(shopId, details, { src: 'google', lang: 'en' }),
        language: 'en',
        platform: 'ACTION_PLATFORM_WEB_APPLICATION',
        action_link_type: 'ACTION_LINK_TYPE_MAKE_DINING_RESERVATION',
      },
    ],
  };
  const tel = intlPhone(info && info.phone);
  if (tel) m.telephone = tel;
  return m;
}

async function buildFeed(db) {
  const now = Date.now();
  const all = (await db.ref('shop_details').get()).val() || {};
  const ready = [], skipped = [], merchants = [];

  for (const [shopId, details] of Object.entries(all)) {
    if (!details || typeof details !== 'object') continue;
    const name = details.displayName || shopId;
    const missing = missingFor(details, now);
    if (missing.length) { skipped.push({ shop: shopId, name, missing }); continue; }

    const info = (await db.ref(`shop_profile/${shopId}/info`).get()).val() || {};
    const m = merchantFor(shopId, details, info);
    merchants.push(m);
    ready.push({ shop: shopId, name, url: m.url, warnings: m.telephone ? [] : ['Χωρίς τηλέφωνο (προτείνεται)'] });
  }

  const feed = {
    metadata: {
      processing_instruction: 'PROCESS_AS_COMPLETE',
      shard_number: 0,
      total_shards: 1,
      nonce: String(now),
      generation_timestamp: Math.floor(now / 1000),
    },
    merchant: merchants,
  };
  return { generatedAt: now, ready, skipped, feed };
}

module.exports = { buildFeed, missingFor, intlPhone };
