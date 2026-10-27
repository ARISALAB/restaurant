// «Στείλε μου δοκιμαστικό»: ο ιδιοκτήτης βλέπει στο δικό του email ακριβώς ό,τι θα πάρουν οι πελάτες του.
// POST με Authorization: Bearer <Firebase ID token>, σώμα { lang }
const admin = require('firebase-admin');
const { Resend } = require('resend');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { normLang } = require('./_shared/i18n');
const { localToMs, localDay, tzOr } = require('./_shared/time');
const { reviewUrl, sendReviewEmail, okEmail } = require('./_shared/reviews');

const resend = new Resend(process.env.RESEND_API_KEY);
const WAIT_MS = 60 * 1000;   // ένα δοκιμαστικό το λεπτό

const SAMPLE_NAME = { el: 'Μαρία Παπαδοπούλου', en: 'Anna Smith', de: 'Anna Schmidt', fr: 'Marie Dubois', it: 'Giulia Rossi', es: 'Lucía García', tr: 'Ayşe Yılmaz', pt: 'Ana Silva' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return json(401, { error: 'no_token' });
  const db = getDb();
  let caller;
  try { caller = await admin.auth().verifyIdToken(h.slice(7)); }
  catch { return json(401, { error: 'invalid_token' }); }

  const shop = (await db.ref(`users_to_shops/${caller.uid}`).get()).val();
  if (!shop) return json(404, { error: 'no_shop' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) {}
  const lang = normLang(body.lang);

  const [d, cfg, info] = await Promise.all([
    db.ref(`shop_details/${shop}`).get().then(s => s.val() || {}),
    db.ref(`shop_profile/${shop}/reviews`).get().then(s => s.val() || {}),
    db.ref(`shop_profile/${shop}/info`).get().then(s => s.val() || {}),
  ]);
  const link = reviewUrl(d, cfg);
  if (!link) return json(400, { error: 'no_link' });

  const to = [info.notificationEmail, d.email, caller.email].find(okEmail);
  if (!to) return json(400, { error: 'no_email' });

  const lastRef = db.ref(`review_tests/${shop}`);
  const now = Date.now();
  const last = await lastRef.transaction(cur => (cur && now - cur < WAIT_MS ? undefined : now));
  if (!last.committed) return json(429, { error: 'too_soon' });

  const tz = tzOr(info.tz);
  const yesterday = localDay(localToMs(localDay(now, tz), '12:00', tz) - 86400000, tz);
  try {
    await sendReviewEmail(resend, {
      to, name: SAMPLE_NAME[lang], date: yesterday, time: '20:30',
      shopName: d.displayName || shop, link, lang,
      replyTo: okEmail(info.notificationEmail) ? info.notificationEmail : (okEmail(d.email) ? d.email : null),
    });
  } catch (e) {
    console.error('[review-test] send failed', shop, e.message);
    await lastRef.remove().catch(() => {});
    return json(502, { error: 'send_failed' });
  }
  return json(200, { ok: true, to });
};
