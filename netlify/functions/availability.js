// Πόσα άτομα έχουν κλείσει ανά ώρα σε μια ημέρα (χωρίς προσωπικά στοιχεία).
// GET /.netlify/functions/availability?shop=plaki&date=2026-10-12  ->  { "taken": { "20:00": 6, "20:30": 2 } }
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' });

  const q = event.queryStringParameters || {};
  const shop = String(q.shop || '');
  const date = String(q.date || '');
  if (!/^[a-zA-Z0-9_]{1,60}$/.test(shop) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(400, { error: 'bad_request' });

  const db = getDb();
  const snap = await db.ref(`reservations/${shop}`).orderByChild('date').equalTo(date).get();
  const taken = {};
  snap.forEach(c => {
    const r = c.val() || {};
    if (r.status === 'cancelled' || !r.time) return;
    const g = parseInt(r.guests, 10) || 0;
    taken[r.time] = (taken[r.time] || 0) + g;
  });
  const res = json(200, { taken });
  res.headers['Cache-Control'] = 'no-store';
  return res;
};
