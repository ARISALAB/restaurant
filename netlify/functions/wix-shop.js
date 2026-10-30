// Ποιο κατάστημα TableReserve έχει συνδεθεί σε ένα site Wix
//
// POST /.netlify/functions/wix-shop
//   από το widget:    Authorization: <Wix access token>   (fetchWithAuth)
//   από το dashboard: { instance: "<?instance= του iframe>" }
// -> { connected:false } | { connected:true, shop, slug, name, url, owner }
const { getDb } = require('./_shared/firebase');
const { json } = require('./_shared/respond');

// Το widget καλείται από το site του πελάτη στο Wix και το Wix προσθέτει δικά του headers
// (Authorization, x-wix-linguist κ.ά.). Επιτρέπουμε ό,τι ζητήσει ο browser στο preflight.
function cors(event, res) {
  const asked = event.headers['access-control-request-headers'] || event.headers['Access-Control-Request-Headers'];
  res.headers = Object.assign({}, res.headers, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': asked || 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
  });
  return res;
}
const { wixIdentify } = require('./_shared/wix');

exports.handler = async (event) => cors(event, await handle(event));

async function handle(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' });

  let b = {};
  try { b = JSON.parse(event.body || '{}'); } catch {}
  const token = b.instance || event.headers.authorization || event.headers.Authorization || '';
  const who = await wixIdentify(token);
  if (!who) return json(401, { error: 'invalid_wix_token' });

  const db = getDb();
  try {
    const link = (await db.ref(`wix_sites/${who.instanceId}`).get()).val();
    if (!link || !link.shop) return json(200, { connected: false, owner: who.owner });
    const d = (await db.ref(`shop_details/${link.shop}`).get()).val();
    if (!d || d.status === 'closed') return json(200, { connected: false, owner: who.owner });
    const slug = d.slug || null;
    return json(200, {
      connected: true,
      owner: who.owner,
      shop: link.shop,
      slug,
      name: d.displayName || link.shop,
      url: 'https://tablereserve.gr/' + (slug || ('?shop=' + encodeURIComponent(link.shop))),
    });
  } catch (e) {
    console.error('[wix-shop]', e);
    return json(500, { error: 'server_error' });
  }
}
