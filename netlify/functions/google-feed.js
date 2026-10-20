// Προεπισκόπηση του merchant feed για Google (μόνο για τον superadmin).
// GET /.netlify/functions/google-feed   (Authorization: Bearer <Firebase ID token>)
//   -> { generatedAt, ready:[{shop,name,url,warnings}], skipped:[{shop,name,missing}], feed:{metadata, merchant[]} }
//
// Όταν μας δεχτεί η Google, το ίδιο feed θα ανεβαίνει αυτόματα με SFTP.
const admin = require('firebase-admin');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { buildFeed } = require('./_shared/google-feed');

const SUPERADMIN_UID = process.env.SUPERADMIN_UID || 'cGhWqj5Mtiey6AC8CMpiUZDxAGh1';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  const db = getDb();
  const h = event.headers.authorization || event.headers.Authorization || '';
  if (!h.startsWith('Bearer ')) return json(401, { error: 'no_token' });
  let caller;
  try { caller = await admin.auth().verifyIdToken(h.slice(7)); }
  catch { return json(401, { error: 'invalid_token' }); }
  if (caller.uid !== SUPERADMIN_UID) return json(403, { error: 'not_superadmin' });

  try {
    const out = await buildFeed(db);
    const res = json(200, out);
    res.headers['Cache-Control'] = 'no-store';
    return res;
  } catch (e) {
    console.error('[google-feed]', e);
    return json(500, { error: 'server_error' });
  }
};
