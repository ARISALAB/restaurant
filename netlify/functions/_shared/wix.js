// Wix App Market: ταυτοποίηση του site Wix από το οποίο έρχεται ένα αίτημα
//
// Το Wix δίνει στις σελίδες της εφαρμογής ένα token:
//   - dashboard page (iframe): ?instance=<υπογεγραμμένο instance>
//   - widget στο site (custom element): Authorization header μέσω fetchWithAuth()
// Και τα δύο τα επαληθεύουμε στο Wix (Token Info) και παίρνουμε το instanceId,
// δηλαδή «αυτή η εγκατάσταση της εφαρμογής σε αυτό το site».
//
// Βάση:
//   wix_sites/<instanceId> = { shop, connectedAt, uid, siteId }
//
// Μεταβλητές Netlify (προαιρετικές):
//   WIX_APP_ID      (προεπιλογή: το App ID του TableReserve στο Wix)
//   WIX_APP_SECRET  εφεδρικός έλεγχος υπογραφής, αν το Token Info δεν απαντήσει

const crypto = require('crypto');

const APP_ID = process.env.WIX_APP_ID || 'eb40160f-f428-4f89-b863-9d40b4241649';
const ID_RE = /^[A-Za-z0-9-]{8,64}$/;

const b64url = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// Το παλιό ?instance= έχει μέσα permissions/uid. Μόνο ως ένδειξη, αφού το token
// έχει ήδη επαληθευτεί από το Token Info: 'owner' | 'visitor' | null
function legacyPerm(token) {
  const i = token.indexOf('.');
  if (i < 1) return null;
  try {
    const p = JSON.parse(b64url(token.slice(i + 1)).toString('utf8'));
    if (p.permissions === 'OWNER' || (p.uid && p.uid === p.siteOwnerId)) return 'owner';
    if (p.permissions !== undefined && p.permissions !== 'OWNER' && !p.uid) return 'visitor';
    return null;
  } catch { return null; }
}

// Εφεδρικά: τοπικός έλεγχος της υπογραφής του ?instance= με το App Secret
function verifySigned(token) {
  const secret = process.env.WIX_APP_SECRET;
  if (!secret) return null;
  const i = token.indexOf('.');
  if (i < 1) return null;
  const sig = b64url(token.slice(0, i));
  const data = token.slice(i + 1);
  const mine = crypto.createHmac('sha256', secret).update(data).digest();
  if (sig.length !== mine.length || !crypto.timingSafeEqual(sig, mine)) return null;
  try {
    const p = JSON.parse(b64url(data).toString('utf8'));
    if (!ID_RE.test(p.instanceId || '')) return null;
    const owner = p.permissions === 'OWNER' || (p.uid && p.uid === p.siteOwnerId);
    return { instanceId: p.instanceId, siteId: p.siteId || null, owner: !!owner };
  } catch { return null; }
}

// -> { instanceId, siteId, owner } ή null
async function wixIdentify(raw) {
  const token = String(raw || '').replace(/^Bearer\s+/i, '').trim();
  if (!token || token.length > 6000) return null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch('https://www.wixapis.com/oauth2/token-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    if (r.ok) {
      const d = await r.json();
      if (d.active === false) return null;
      if (d.clientId && d.clientId !== APP_ID) return null;
      if (!ID_RE.test(d.instanceId || '')) return null;
      const subj = String(d.subjectType || '').toUpperCase();
      // Επισκέπτες και μέλη του site (από το widget) δεν μπορούν να συνδέσουν/αποσυνδέσουν.
      // Οτιδήποτε άλλο έρχεται από τον πίνακα ελέγχου του Wix, που ανοίγει μόνο ο ιδιοκτήτης
      // και οι συνεργάτες του site.
      const visitor = /VISITOR|MEMBER|ANONYMOUS/.test(subj) || legacyPerm(token) === 'visitor';
      const owner = !visitor;
      console.log('[wix] token-info', JSON.stringify({ subjectType: d.subjectType || null, owner }));
      return { instanceId: d.instanceId, siteId: d.siteId || null, owner };
    }
    console.warn('[wix] token-info', r.status);
  } catch (e) {
    console.warn('[wix] token-info failed', e && e.message);
  }
  return verifySigned(token);
}

module.exports = { APP_ID, wixIdentify };

// ───────────────────────── Χρέωση μέσω Wix ─────────────────────────
// Ο ιδιοκτήτης αγοράζει πλάνο στο Wix (App Market). Διαβάζουμε την κατάσταση από το Wix
// (Get App Instance) και ενημερώνουμε το paidUntil του καταστήματος, όπως κάνει το Lemon Squeezy.
// Χρειάζεται: WIX_APP_SECRET στο Netlify και permission «Manage Your App» στο Wix.

const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const upgradeUrl = (instanceId) => `https://www.wix.com/apps/upgrade/${APP_ID}?appInstanceId=${encodeURIComponent(instanceId)}`;
const manageUrl = (instanceId) => `https://www.wix.com/my-account/app/${APP_ID}/${encodeURIComponent(instanceId)}`;

async function postJson(url, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal,
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, d };
  } finally { clearTimeout(timer); }
}

// Access token της εφαρμογής για συγκεκριμένο site
async function wixAppToken(instanceId) {
  const secret = process.env.WIX_APP_SECRET;
  if (!secret || !ID_RE.test(instanceId || '')) return null;
  const base = { grant_type: 'client_credentials', client_id: APP_ID, client_secret: secret };
  let r = await postJson('https://www.wixapis.com/oauth2/token', { ...base, instance_id: instanceId });
  if (!r.ok) r = await postJson('https://www.wixapis.com/oauth2/token', { ...base, instanceId });
  if (!r.ok || !r.d.access_token) { console.warn('[wix] app token', r.status); return null; }
  return r.d.access_token;
}

async function wixInstanceInfo(instanceId) {
  const token = await wixAppToken(instanceId);
  if (!token) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch('https://www.wixapis.com/apps/v1/instance', { headers: { Authorization: token }, signal: ctrl.signal });
    if (!r.ok) { console.warn('[wix] get instance', r.status); return null; }
    return await r.json();
  } catch (e) {
    console.warn('[wix] get instance failed', e && e.message);
    return null;
  } finally { clearTimeout(timer); }
}

// Συγχρονίζει τη συνδρομή Wix -> shop_details/<shop>. Μόνο παρατείνει (δεν κόβει πληρωμή του Lemon).
// -> { paid, isFree, paidUntil, billingStatus } ή null αν δεν ήταν δυνατό να ρωτήσουμε το Wix
async function syncWixBilling(db, instanceId, shop) {
  const info = await wixInstanceInfo(instanceId);
  if (!info || !info.instance) return null;
  const inst = info.instance;
  const now = Date.now();
  const ref = db.ref(`shop_details/${shop}`);
  const d = (await ref.get()).val() || {};
  const base = {
    wixInstanceId: instanceId,
    wixUpgradeUrl: upgradeUrl(instanceId),
    wixManageUrl: manageUrl(instanceId),
  };

  if (inst.isFree !== false) {
    await ref.update(base);
    return { paid: false, isFree: true, paidUntil: d.paidUntil || null, billingStatus: d.billingStatus || null };
  }

  const b = inst.billing || {};
  const exp = Date.parse(b.expirationDate || '');
  const trial = b.freeTrialInfo || {};
  const trialEnd = Date.parse(trial.endDate || '');
  let until, status;
  if (!isNaN(exp) && exp > now) {
    until = exp + (b.autoRenewing === false ? 0 : GRACE_MS);
    status = b.autoRenewing === false ? 'cancelled' : 'active';
  } else if (isNaN(exp) && /IN_PROGRESS|ACTIVE/i.test(String(trial.status || ''))) {
    until = !isNaN(trialEnd) ? trialEnd : now + 14 * DAY_MS;
    status = 'trial';
  } else if (!isNaN(exp)) {
    // Έληξε αλλά το Wix το δείχνει ακόμα πληρωμένο: πρόβλημα πληρωμής, μικρό περιθώριο
    until = now + GRACE_MS;
    status = 'past_due';
  } else {
    // Μηνιαία πλάνα δεν έχουν expirationDate: ο καθημερινός συγχρονισμός παρατείνει όσο είναι πληρωμένο
    until = now + GRACE_MS;
    status = 'active';
  }

  const update = { ...base, wixPackage: b.packageName || '', billingUpdatedAt: now };
  // Δεν πειράζουμε ενεργή συνδρομή Lemon που ισχύει περισσότερο
  if (!d.paidUntil || until >= d.paidUntil || d.billingSource === 'wix') {
    update.paidUntil = Math.max(until, d.billingSource === 'wix' ? 0 : (d.paidUntil || 0));
    update.billingStatus = status;
    update.billingSource = 'wix';
  }
  await ref.update(update);
  return { paid: true, isFree: false, paidUntil: update.paidUntil || d.paidUntil || null, billingStatus: update.billingStatus || d.billingStatus || null };
}

module.exports.syncWixBilling = syncWixBilling;
module.exports.upgradeUrl = upgradeUrl;
module.exports.manageUrl = manageUrl;
