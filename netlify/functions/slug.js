// Δημόσιο όνομα καταστήματος (tablereserve.gr/<slug>)
//
// POST /.netlify/functions/slug
//   { action: 'resolve', slug }   -> { shop, slug }        (δημόσιο: ποιο κατάστημα είναι το /<slug>)
//   { action: 'current', shop }   -> { slug }              (δημόσιο: το τρέχον όνομα ενός καταστήματος)
//   { action: 'check', slug }     -> { available, reason } (με token: μπορώ να το πάρω;)
//   { action: 'set', slug }       -> { ok, slug }          (με token: αλλαγή ονόματος)

const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const S = require('./_shared/slugs');

// Το τρέχον δημόσιο όνομα ενός καταστήματος, μόνο αν όντως του ανήκει
async function currentSlug(db, shopId) {
  const s = (await db.ref(`shop_details/${shopId}/slug`).get()).val();
  if (!s) return null;
  const owner = (await db.ref(`slugs/${s}`).get()).val();
  return owner && owner.shop === shopId ? s : null;
}

async function shopFromToken(db, event) {
  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return { error: json(401, { error: 'no_token' }) };
  let caller;
  try { caller = await admin.auth().verifyIdToken(h.slice(7)); }
  catch { return { error: json(401, { error: 'invalid_token' }) }; }
  const shopId = (await db.ref(`users_to_shops/${caller.uid}`).get()).val();
  if (!shopId) return { error: json(404, { error: 'no_shop' }) };
  return { shopId };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let b;
  try { b = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'bad_json' }); }
  const db = getDb();
  const action = String(b.action || '');

  // ---------- Δημόσια ----------
  if (action === 'resolve') {
    const s = String(b.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,40}$/.test(s)) return json(404, { error: 'not_found' });

    const owner = (await db.ref(`slugs/${s}`).get()).val();
    if (owner && owner.shop && (await db.ref(`shop_details/${owner.shop}/displayName`).get()).exists()) {
      return json(200, { shop: owner.shop, slug: (await currentSlug(db, owner.shop)) || s });
    }
    // Παλιά καταστήματα: το εσωτερικό ID δουλεύει κι αυτό ως διεύθυνση
    if ((await db.ref(`shop_details/${s}/displayName`).get()).exists()) {
      return json(200, { shop: s, slug: (await currentSlug(db, s)) || s });
    }
    return json(404, { error: 'not_found' });
  }

  if (action === 'current') {
    const shop = String(b.shop || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,40}$/.test(shop)) return json(400, { error: 'bad_shop' });
    return json(200, { slug: await currentSlug(db, shop) });
  }

  // ---------- Με λογαριασμό ----------
  if (action !== 'check' && action !== 'set') return json(400, { error: 'bad_action' });

  const who = await shopFromToken(db, event);
  if (who.error) return who.error;
  const { shopId } = who;

  const slug = String(b.slug || '').trim().toLowerCase();
  const current = await currentSlug(db, shopId);
  if (slug === current || (!current && slug === shopId)) return json(200, { available: true, same: true, ok: true, slug });

  const reason = await S.unavailableReason(db, slug, shopId);

  if (action === 'check') return json(200, { available: !reason, reason });

  if (reason) return json(409, { error: reason });

  // Μία αλλαγή κάθε 30 ημέρες (η πρώτη αλλαγή είναι πάντα ελεύθερη)
  const changedAt = (await db.ref(`shop_details/${shopId}/slugChangedAt`).get()).val();
  if (changedAt && Date.now() - changedAt < S.COOLDOWN_MS) {
    return json(429, { error: 'cooldown', until: changedAt + S.COOLDOWN_MS });
  }

  if (!(await S.claim(db, slug, shopId))) return json(409, { error: 'taken' });

  const now = Date.now();
  const updates = {
    [`shop_details/${shopId}/slug`]: slug,
    [`shop_details/${shopId}/slugChangedAt`]: now
  };
  // Το παλιό όνομα μένει στο κατάστημα και οδηγεί στο νέο
  if (current) updates[`slugs/${current}/active`] = false;
  await db.ref().update(updates);

  return json(200, { ok: true, slug });
};
