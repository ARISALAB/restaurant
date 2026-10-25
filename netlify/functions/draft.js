// Προσχέδια καταστημάτων (πιλοτικό): ο superadmin ετοιμάζει τη σελίδα ενός μαγαζιού
// και στέλνει στον ιδιοκτήτη ένα προσωπικό link για να τη δει και να την ενεργοποιήσει.
//
// Βάση:
//   shop_details/<id>   = { displayName, status:'draft', source:'draft', slug, ... }
//   shop_profile/<id>   = { coverPhoto, info:{ address, phone, hours, description, tagline, tz } }
//   drafts/<id>         = { token, createdAt, views, viewedAt, lastViewedAt, claimedAt, claimedBy }
//                         (μόνο ο server διαβάζει/γράφει: οι κανόνες της βάσης δεν επιτρέπουν πρόσβαση)
//
// POST /.netlify/functions/draft
//   { action:'check', shop, token }                    δημόσιο: ισχύει το link προεπισκόπησης;
//   { action:'create', displayName, slug?, ... }       superadmin
//   { action:'list' }                                  superadmin
//   { action:'delete', shop }                          superadmin (μόνο προσχέδια)
//   { action:'renew', shop }                           superadmin: νέο link (το παλιό σταματά να ισχύει)
//   { action:'get', shop }                             superadmin: τα στοιχεία για επεξεργασία
//   { action:'update', shop, displayName, slug?, ... } superadmin: διόρθωση προσχεδίου (το link δεν αλλάζει)

const crypto = require('crypto');
const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { slugify } = require('./_shared/signup');
const { toSlug, unavailableReason, claim, claimInitial } = require('./_shared/slugs');
const { validTz } = require('./_shared/time');

const SUPERADMIN_UID = process.env.SUPERADMIN_UID || 'cGhWqj5Mtiey6AC8CMpiUZDxAGh1';
const DEFAULT_COVER = 'https://tablereserve.gr/hero-table.jpg';
const BASE = 'https://tablereserve.gr/';

const str = (v, max) => (typeof v === 'string' ? v.trim() : '').slice(0, max);
const newToken = () => crypto.randomBytes(12).toString('hex');
const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length &&
  crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function isSuperadmin(event) {
  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return false;
  try { return (await admin.auth().verifyIdToken(h.slice(7))).uid === SUPERADMIN_UID; }
  catch { return false; }
}

const previewUrl = (slug, shop, token) => `${BASE}${slug || shop}?claim=${token}`;

const INFO_FIELDS = [['address', 200], ['phone', 30], ['hours', 200], ['description', 500], ['tagline', 120]];
// Μόνο εικόνες από https (στην πράξη το Cloudinary του TableReserve)
const imgUrl = v => { const u = str(v, 500); return /^https:\/\//.test(u) ? u : ''; };

// Ωράριο ανά ημέρα, ίδια μορφή με το admin: { mon:'closed' | [{o:'11:30', c:'14:30'}, ...], ... }
const WH_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
function cleanWeek(w) {
  if (!w || typeof w !== 'object') return null;
  const out = {}; let open = 0;
  for (const d of WH_DAYS) {
    const v = w[d];
    const ranges = Array.isArray(v) ? v.filter(r => r && HM.test(r.o) && HM.test(r.c) && r.o !== r.c).slice(0, 3).map(r => ({ o: r.o, c: r.c })) : [];
    out[d] = ranges.length ? ranges : 'closed';
    if (ranges.length) open++;
  }
  return open ? out : null;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }
  const db = getDb();
  const action = String(b.action || '');

  // ── Δημόσιο: έλεγχος link προεπισκόπησης ──
  if (action === 'check') {
    const shop = str(b.shop, 60), token = str(b.token, 60);
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(shop) || !token) return json(400, { error: 'bad_request' });
    const [details, draft] = await Promise.all([
      db.ref(`shop_details/${shop}`).get().then(x => x.val()),
      db.ref(`drafts/${shop}`).get().then(x => x.val()),
    ]);
    if (!details || details.status !== 'draft' || !draft || !sameToken(draft.token, token))
      return json(404, { error: 'invalid_link' });
    // Μετράμε τις προβολές, για να ξέρει ο superadmin ποιος το άνοιξε
    if (b.track !== false) {
      const now = Date.now();
      await db.ref(`drafts/${shop}`).update({
        views: admin.database.ServerValue.increment(1),
        lastViewedAt: now,
        ...(draft.viewedAt ? {} : { viewedAt: now }),
      }).catch(() => {});
    }
    return json(200, { ok: true, name: details.displayName || shop, slug: details.slug || null });
  }

  if (!(await isSuperadmin(event))) return json(403, { error: 'not_superadmin' });

  // ── Νέο προσχέδιο ──
  if (action === 'create') {
    const displayName = str(b.displayName, 80);
    if (!displayName) return json(400, { error: 'missing_name' });

    // Εσωτερικό ID από το όνομα
    const base = slugify(displayName);
    let shopId = null;
    for (let i = 1; i <= 50; i++) {
      const c = i === 1 ? base : `${base}_${i}`;
      if (!(await db.ref(`shop_details/${c}`).get()).exists()) { shopId = c; break; }
    }
    if (!shopId) return json(409, { error: 'shop_exists' });

    // Δημόσιο link: αν δόθηκε, πρέπει να είναι ελεύθερο
    const wanted = toSlug(str(b.slug, 40));
    if (wanted) {
      const why = await unavailableReason(db, wanted, shopId);
      if (why) return json(409, { error: 'slug_' + why });
    }

    const now = Date.now();
    const token = newToken();
    const info = { tz: validTz(b.tz) ? b.tz : 'Europe/Athens' };
    const week = cleanWeek(b.hoursWeek); if (week) info.hoursWeek = week;
    for (const [k, max] of INFO_FIELDS) { const v = str(b[k], max); if (v) info[k] = v; }
    await db.ref().update({
      [`shop_details/${shopId}`]: { displayName, status: 'draft', source: 'draft', createdAt: now, lang: 'el' },
      [`shop_profile/${shopId}/info`]: info,
      [`shop_profile/${shopId}/coverPhoto`]: imgUrl(b.cover) || DEFAULT_COVER,
      [`shop_profile/${shopId}/logoPhoto`]: imgUrl(b.logo) || null,
      [`drafts/${shopId}`]: { token, createdAt: now, views: 0 },
    });

    let slug = null;
    if (wanted && await claim(db, wanted, shopId)) {
      slug = wanted;
      await db.ref(`shop_details/${shopId}/slug`).set(slug);
    } else {
      slug = await claimInitial(db, shopId, displayName);
    }
    return json(200, { ok: true, shopId, slug, url: previewUrl(slug, shopId, token) });
  }

  // ── Λίστα προσχεδίων και πορεία τους ──
  if (action === 'list') {
    const drafts = (await db.ref('drafts').get()).val() || {};
    const ids = Object.keys(drafts);
    const details = await Promise.all(ids.map(id => db.ref(`shop_details/${id}`).get().then(x => x.val() || {})));
    const out = ids.map((id, i) => {
      const d = drafts[id] || {}, s = details[i];
      return {
        shopId: id, name: s.displayName || id, slug: s.slug || null, status: s.status || 'deleted',
        createdAt: d.createdAt || null, views: d.views || 0, viewedAt: d.viewedAt || null, lastViewedAt: d.lastViewedAt || null,
        claimedAt: d.claimedAt || null, claimedBy: d.claimedBy || null,
        url: d.token && s.status === 'draft' ? previewUrl(s.slug, id, d.token) : null,
      };
    }).filter(x => x.status !== 'deleted').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return json(200, { ok: true, drafts: out });
  }

  // ── Στοιχεία προσχεδίου για επεξεργασία ──
  if (action === 'get') {
    const shop = str(b.shop, 60);
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(shop)) return json(400, { error: 'bad_request' });
    const [details, profile] = await Promise.all([
      db.ref(`shop_details/${shop}`).get().then(x => x.val()),
      db.ref(`shop_profile/${shop}`).get().then(x => x.val() || {}),
    ]);
    if (!details || details.status !== 'draft') return json(409, { error: 'not_draft' });
    const info = profile.info || {};
    const out = { shopId: shop, displayName: details.displayName || '', slug: details.slug || '',
      cover: profile.coverPhoto === DEFAULT_COVER ? '' : (profile.coverPhoto || ''), logo: profile.logoPhoto || '' };
    for (const [k] of INFO_FIELDS) out[k] = info[k] || '';
    out.tz = info.tz || 'Europe/Athens';
    out.hoursWeek = info.hoursWeek || null;
    return json(200, { ok: true, draft: out });
  }

  // ── Διόρθωση προσχεδίου ──
  if (action === 'update') {
    const shop = str(b.shop, 60);
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(shop)) return json(400, { error: 'bad_request' });
    const details = (await db.ref(`shop_details/${shop}`).get()).val();
    if (!details || details.status !== 'draft') return json(409, { error: 'not_draft' });
    const displayName = str(b.displayName, 80);
    if (!displayName) return json(400, { error: 'missing_name' });

    // Αλλαγή link: μόνο αν είναι ελεύθερο. Το παλιό ελευθερώνεται (το προσχέδιο δεν είναι δημόσιο).
    const wanted = toSlug(str(b.slug, 40));
    let slug = details.slug || null;
    if (wanted && wanted !== slug) {
      const why = await unavailableReason(db, wanted, shop);
      if (why) return json(409, { error: 'slug_' + why });
      if (!(await claim(db, wanted, shop))) return json(409, { error: 'slug_taken' });
      if (slug) await db.ref(`slugs/${slug}`).remove().catch(() => {});
      slug = wanted;
    }

    const upd = {
      [`shop_details/${shop}/displayName`]: displayName,
      [`shop_details/${shop}/slug`]: slug,
      [`shop_profile/${shop}/coverPhoto`]: imgUrl(b.cover) || DEFAULT_COVER,
      [`shop_profile/${shop}/logoPhoto`]: imgUrl(b.logo) || null,
    };
    for (const [k, max] of INFO_FIELDS) upd[`shop_profile/${shop}/info/${k}`] = str(b[k], max) || null;
    if (validTz(b.tz)) upd[`shop_profile/${shop}/info/tz`] = b.tz;
    upd[`shop_profile/${shop}/info/hoursWeek`] = cleanWeek(b.hoursWeek);
    await db.ref().update(upd);
    const token = (await db.ref(`drafts/${shop}/token`).get()).val();
    return json(200, { ok: true, shopId: shop, slug, url: token ? previewUrl(slug, shop, token) : null });
  }

  // ── Νέο link (το παλιό σταματά να ισχύει) ──
  if (action === 'renew') {
    const shop = str(b.shop, 60);
    const status = (await db.ref(`shop_details/${shop}/status`).get()).val();
    if (status !== 'draft') return json(409, { error: 'not_draft' });
    const token = newToken();
    await db.ref(`drafts/${shop}`).update({ token, renewedAt: Date.now() });
    const slug = (await db.ref(`shop_details/${shop}/slug`).get()).val();
    return json(200, { ok: true, url: previewUrl(slug, shop, token) });
  }

  // ── Διαγραφή προσχεδίου (ποτέ ενεργού καταστήματος) ──
  if (action === 'delete') {
    const shop = str(b.shop, 60);
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(shop)) return json(400, { error: 'bad_request' });
    const details = (await db.ref(`shop_details/${shop}`).get()).val();
    if (!details) { await db.ref(`drafts/${shop}`).remove(); return json(200, { ok: true }); }
    if (details.status !== 'draft') return json(409, { error: 'not_draft' });
    const upd = { [`shop_details/${shop}`]: null, [`shop_profile/${shop}`]: null, [`drafts/${shop}`]: null };
    // Ελευθερώνουμε τα ονόματα (links) που είχε κρατήσει
    const slugs = (await db.ref('slugs').orderByChild('shop').equalTo(shop).get().catch(() => null));
    if (slugs) slugs.forEach(c => { upd[`slugs/${c.key}`] = null; });
    else if (details.slug) upd[`slugs/${details.slug}`] = null;
    await db.ref().update(upd);
    return json(200, { ok: true });
  }

  return json(400, { error: 'bad_action' });
};
