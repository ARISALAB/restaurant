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
//   - έχουν αποδεχτεί τους όρους (έκδοση με τη ρήτρα για Google)
//   - έχουν πλήρη στοιχεία Google και τα έχει επαληθεύσει ο superadmin
//
// Μορφή: Actions Center Merchants feed (JSON), ενιαίο αρχείο (PROCESS_AS_COMPLETE).

const { hasGoogleTerms } = require('./terms');

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

// Καθαρό link: το δημόσιο όνομα, αλλιώς το ID ως διεύθυνση (το edge αναγνωρίζει και τα δύο)
function bookingUrl(shopId, details, params) {
  const path = details.slug || (/^[A-Za-z0-9][A-Za-z0-9_-]{1,39}$/.test(shopId) ? shopId.toLowerCase() : null);
  const base = path ? BASE_URL + path : BASE_URL + '?shop=' + encodeURIComponent(shopId);
  const q = new URLSearchParams(params).toString();
  return base + (base.includes('?') ? '&' : '?') + q;
}

// Ελληνικός ΤΚ με κενό: 10556 -> 105 56
function postal(code, country) {
  const c = String(code).replace(/\s+/g, '').trim();
  return (country === 'GR' && /^\d{5}$/.test(c)) ? c.slice(0, 3) + ' ' + c.slice(3) : String(code).replace(/\s+/g, ' ').trim();
}

function isActive(details, now) {
  if (!details) return false;
  if (details.status === 'pending' || details.status === 'closed' || details.status === 'draft') return false;
  if (details.paidUntil && details.paidUntil < now) return false;
  return true;
}

// Τι λείπει για να μπει ένα μαγαζί στο feed (κενή λίστα = έτοιμο)
function missingFor(details, now = Date.now(), info = null) {
  const g = (details && details.google) || {};
  const missing = [];
  if (!isActive(details, now)) missing.push('Ανενεργό κατάστημα');
  if (!details || !details.displayName) missing.push('Όνομα');
  if (!hasGoogleTerms(details)) missing.push('Αποδοχή όρων');
  REQUIRED.forEach(([k, label]) => {
    const v = g[k];
    if (v === undefined || v === null || v === '') missing.push(label);
  });
  if (typeof g.lat === 'number' && (g.lat < -90 || g.lat > 90)) missing.push('Σωστό γεωγρ. πλάτος');
  if (typeof g.lng === 'number' && (g.lng < -180 || g.lng > 180)) missing.push('Σωστό γεωγρ. μήκος');
  if (!g.verified) missing.push('Επαλήθευση στο Maps');
  if (info && !intlPhone(info.phone)) missing.push('Τηλέφωνο στο προφίλ');
  return missing;
}

function merchantFor(shopId, details, info) {
  const g = details.google;
  const m = {
    merchant_id: shopId,
    name: details.displayName,
    category: 'restaurant',
    geo: {
      latitude: Number(g.lat),
      longitude: Number(g.lng),
      address: {
        country: (g.country || 'GR').toUpperCase(),
        locality: g.city,
        postal_code: postal(g.postalCode, (g.country || 'GR').toUpperCase()),
        street_address: g.street,
      },
    },
    matching_hints: { place_id: g.placeId },
    action_link: [
      {
        url: bookingUrl(shopId, details, { src: 'google' }),
        platform: 'ACTION_PLATFORM_WEB_APPLICATION',
        action_link_type: 'ACTION_LINK_TYPE_MAKE_DINING_RESERVATION',
      },
    ],
  };
  const tel = intlPhone(info && info.phone);
  if (tel) m.telephone = tel;
  // url = το δικό του site του εστιατορίου (αν έχει). Το link κράτησης πάει στα action_link.
  if (g.website && /^https?:\/\/[^\s]+$/i.test(g.website)) m.url = g.website;
  return m;
}

async function buildFeed(db) {
  const now = Date.now();
  const all = (await db.ref('shop_details').get()).val() || {};
  const ready = [], skipped = [], merchants = [];

  for (const [shopId, details] of Object.entries(all)) {
    if (!details || typeof details !== 'object') continue;
    const name = details.displayName || shopId;
    const info = (await db.ref(`shop_profile/${shopId}/info`).get()).val() || {};
    const missing = missingFor(details, now, info);
    if (missing.length) { skipped.push({ shop: shopId, name, missing }); continue; }

    const m = merchantFor(shopId, details, info);
    merchants.push(m);
    ready.push({ shop: shopId, name, url: m.action_link[0].url, warnings: m.url ? [] : ['Χωρίς site εστιατορίου (προαιρετικό)'] });
  }

  const feed = {
    metadata: {
      processing_instruction: 'PROCESS_AS_COMPLETE',
      shard_number: 0,
      total_shards: 1,
      nonce: String(now),
      generation_timestamp: String(Math.floor(now / 1000)),
    },
    merchant: merchants,
  };
  return { generatedAt: now, ready, skipped, feed };
}

module.exports = { buildFeed, missingFor, intlPhone };
