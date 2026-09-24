// Webhook του Lemon Squeezy: ενημερώνει μέχρι πότε είναι πληρωμένο κάθε κατάστημα
const crypto = require('crypto');
const { getDb } = require('./_shared/firebase');

const GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 ημέρες περιθώριο για καθυστερήσεις ανανέωσης

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'method_not_allowed' };

  const secret = process.env.LEMON_WEBHOOK_SECRET;
  if (!secret) { console.error('LEMON_WEBHOOK_SECRET missing'); return { statusCode: 500, body: 'not_configured' }; }

  const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
  const sig = event.headers['x-signature'] || event.headers['X-Signature'] || '';
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const ok = sig.length === digest.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(digest));
  if (!ok) return { statusCode: 401, body: 'bad_signature' };

  let payload;
  try { payload = JSON.parse(raw); } catch { return { statusCode: 400, body: 'bad_json' }; }

  const eventName = payload.meta?.event_name || '';
  const shopId = payload.meta?.custom_data?.shop_id;
  const data = payload.data || {};
  if (data.type !== 'subscriptions' || !shopId) return { statusCode: 200, body: 'ignored' };

  const a = data.attributes || {};
  const db = getDb();
  const shopRef = db.ref(`shop_details/${shopId}`);
  if (!(await shopRef.get()).exists()) { console.error('unknown shop', shopId); return { statusCode: 200, body: 'unknown_shop' }; }

  const update = {
    billingStatus: a.status || eventName,
    lemonSubscriptionId: String(data.id),
    lemonVariant: a.variant_name || '',
    lemonPortalUrl: a.urls?.customer_portal || '',
    billingUpdatedAt: Date.now()
  };

  // Μέχρι πότε ισχύει: επόμενη ανανέωση ή ημερομηνία λήξης μετά από ακύρωση
  const until = Date.parse(a.ends_at || a.renews_at || '');
  if (!isNaN(until) && ['active', 'on_trial', 'cancelled', 'past_due'].includes(a.status)) {
    update.paidUntil = until + (a.status === 'cancelled' ? 0 : GRACE_MS);
  }
  if (a.status === 'expired' || a.status === 'unpaid') update.paidUntil = Date.now();

  await shopRef.update(update);
  console.log('lemon', eventName, shopId, update.billingStatus, update.paidUntil);
  return { statusCode: 200, body: 'ok' };
};
