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
      // Ιδιοκτήτης/συνεργάτης του site στο dashboard, όχι επισκέπτης ή μέλος του site
      const owner = subj === 'USER' || subj === 'APP';
      return { instanceId: d.instanceId, siteId: d.siteId || null, owner };
    }
    console.warn('[wix] token-info', r.status);
  } catch (e) {
    console.warn('[wix] token-info failed', e && e.message);
  }
  return verifySigned(token);
}

module.exports = { APP_ID, wixIdentify };
