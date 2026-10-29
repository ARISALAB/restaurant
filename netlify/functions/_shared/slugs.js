// Δημόσια ονόματα καταστημάτων (slugs): tablereserve.gr/<slug>
//
// Βάση:
//   slugs/<slug>               = { shop: <shopId>, active: true|false, at: <ms> }
//   shop_details/<id>/slug     = τρέχον δημόσιο όνομα
//   shop_details/<id>/slugChangedAt = πότε το άλλαξε ο χρήστης τελευταία φορά
//
// Τα παλιά ονόματα μένουν για πάντα στο ίδιο κατάστημα (active:false) και
// οδηγούν στο νέο, ώστε τα QR και τα links που έχουν μοιραστεί να μη σπάνε.

const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

const RESERVED = new Set([
  // σελίδες και φάκελοι του site
  'admin', 'superadmin', 'partners', 'partner', 'privacy', 'terms', 'site', 'en', 'el', 'gr', 'de', 'fr', 'it', 'es', 'tr', 'pt',
  'api', 'downloads', 'download', 'netlify', 'cancel', 'embed', 'index', 'robots', 'sitemap', 'claim',
  'favicon', 'billing', 'assets', 'static', 'img', 'images', 'css', 'js', 'fonts',
  // πιθανές μελλοντικές σελίδες
  'book', 'booking', 'bookings', 'reserve', 'reservation', 'reservations', 'login', 'logout',
  'signin', 'signup', 'register', 'account', 'accounts', 'settings', 'dashboard', 'app', 'apps',
  'pricing', 'plans', 'checkout', 'pay', 'payment', 'payments', 'invoice', 'invoices',
  'blog', 'news', 'help', 'support', 'faq', 'docs', 'guide', 'guides', 'about', 'contact',
  'legal', 'cookies', 'gdpr', 'impressum', 'status', 'demo', 'test', 'new', 'edit', 'search',
  'home', 'www', 'mail', 'email', 'shop', 'shops', 'store', 'stores', 'restaurant',
  'restaurants', 'map', 'maps', 'r', 's', 'u', 'go', 'link', 'links', 'qr', 'widget',
  'tablereserve', 'table-reserve', 'arakron', 'ar-akron', 'official', 'default-store',
  'null', 'undefined', 'root', 'system', 'webmaster', 'postmaster', 'hostmaster', 'abuse',
  'security', 'feed', 'rss', 'sitemaps', 'well-known',
  // ελληνικές σελίδες του site (υπάρχουσες και πιθανές)
  'leitourgies', 'times', 'timokatalogos', 'sygkrisi', 'odigoi', 'epikoinonia', 'katopsi', 'katopsi-trapezion'
]);

// Ελληνικά -> λατινικά
const GR = {α:'a',ά:'a',β:'v',γ:'g',δ:'d',ε:'e',έ:'e',ζ:'z',η:'i',ή:'i',θ:'th',ι:'i',ί:'i',ϊ:'i',ΐ:'i',κ:'k',λ:'l',μ:'m',ν:'n',ξ:'x',ο:'o',ό:'o',π:'p',ρ:'r',σ:'s',ς:'s',τ:'t',υ:'y',ύ:'y',ϋ:'y',ΰ:'y',φ:'f',χ:'ch',ψ:'ps',ω:'o',ώ:'o'};

// Οτιδήποτε -> υποψήφιο slug (πεζά λατινικά, αριθμοί, παύλα)
function toSlug(input) {
  return String(input || '').toLowerCase()
    .replace(/ού/g, 'ou').replace(/ου/g, 'ou').replace(/μπ/g, 'b').replace(/ντ/g, 'nt')
    .replace(/[α-ωάέήίόύώϊϋΐΰς]/g, c => GR[c] || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 30).replace(/-+$/, '');
}

// 3-30 χαρακτήρες, a-z 0-9 -, όχι παύλα στην αρχή/τέλος, όχι διπλή παύλα
function isValid(s) {
  return typeof s === 'string' && /^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/.test(s) && !s.includes('--');
}

function isReserved(s) {
  return RESERVED.has(s);
}

// Γιατί δεν μπορεί αυτό το κατάστημα να πάρει το slug; null = μπορεί.
async function unavailableReason(db, slug, shopId) {
  if (!isValid(slug)) return 'invalid';
  if (isReserved(slug)) return 'reserved';
  const owner = (await db.ref(`slugs/${slug}`).get()).val();
  if (owner && owner.shop !== shopId) return 'taken';
  // Μην πάρεις το εσωτερικό ID άλλου καταστήματος (τα παλιά links ?shop= και /ID)
  if (slug !== shopId && (await db.ref(`shop_details/${slug}`).get()).exists()) return 'taken';
  return null;
}

// Ατομική δέσμευση. true αν το slug ανήκει πλέον στο κατάστημα.
async function claim(db, slug, shopId) {
  const res = await db.ref(`slugs/${slug}`).transaction(cur => {
    if (cur === null || cur.shop === shopId) return { shop: shopId, active: true, at: Date.now() };
    return; // ανήκει σε άλλον: ακύρωση
  });
  return res.committed;
}

// Σε νέα εγγραφή: δίνει αυτόματα ένα slug από το όνομα. Δεν σταματά την εγγραφή αν αποτύχει.
async function claimInitial(db, shopId, name) {
  try {
    let base = toSlug(name);
    if (!isValid(base)) base = toSlug(shopId);
    if (!isValid(base)) return null;
    for (let i = 1; i <= 20; i++) {
      const cand = i === 1 ? base : `${base.slice(0, 27)}-${i}`;
      if (await unavailableReason(db, cand, shopId)) continue;
      if (await claim(db, cand, shopId)) {
        await db.ref(`shop_details/${shopId}/slug`).set(cand);
        return cand;
      }
    }
  } catch (e) { console.error('claimInitial failed', e); }
  return null;
}

module.exports = { COOLDOWN_MS, toSlug, isValid, isReserved, unavailableReason, claim, claimInitial };
