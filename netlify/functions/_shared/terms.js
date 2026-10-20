// Όροι Χρήσης: τρέχουσα έκδοση και καταγραφή αποδοχής.
//
// Κάθε αποδοχή γράφεται:
//   shop_details/<id>/termsVersion, termsAcceptedAt, termsAcceptedIp, termsAcceptedBy, termsAcceptedVia
//   terms_log/<id>/<auto>  = { version, at, ip, uid, via }   (ιστορικό, μόνο ο server γράφει/διαβάζει)
//
// Όταν αλλάζουν οι όροι: νέα ημερομηνία εδώ ΚΑΙ στο admin (TERMS_VERSION) ΚΑΙ στο superadmin.

const TERMS_VERSION = '2026-10-20';

// Από αυτή την έκδοση και μετά οι όροι περιλαμβάνουν την εμφάνιση στο Google.
const GOOGLE_TERMS_MIN = '2026-10-20';

function clientIp(event) {
  const h = (event && event.headers) || {};
  return String(h['x-nf-client-connection-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || '').trim().slice(0, 45);
}

// Πεδία για το shop_details/<id> (για χρήση μέσα σε update)
function termsFields(event, uid, via, now = Date.now()) {
  return {
    termsVersion: TERMS_VERSION,
    termsAcceptedAt: now,
    termsAcceptedIp: clientIp(event),
    termsAcceptedBy: uid || '',
    termsAcceptedVia: via,
  };
}

async function logTerms(db, shopId, fields) {
  await db.ref(`terms_log/${shopId}`).push({
    version: fields.termsVersion,
    at: fields.termsAcceptedAt,
    ip: fields.termsAcceptedIp,
    uid: fields.termsAcceptedBy,
    via: fields.termsAcceptedVia,
  });
}

function hasGoogleTerms(details) {
  return !!(details && typeof details.termsVersion === 'string' && details.termsVersion >= GOOGLE_TERMS_MIN);
}

module.exports = { TERMS_VERSION, GOOGLE_TERMS_MIN, clientIp, termsFields, logTerms, hasGoogleTerms };
