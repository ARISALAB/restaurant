// 1. tablereserve.gr/              -> δείχνει τη σελίδα partners (η διεύθυνση μένει ίδια)
// 2. tablereserve.gr/<όνομα>       -> δείχνει τη σελίδα κράτησης του καταστήματος
//    Το edge βρίσκει ποιο κατάστημα είναι και το γράφει στη σελίδα (window.__TR),
//    ώστε ο browser να μην περιμένει δεύτερο αίτημα (/slug) πριν δείξει το μαγαζί.
//    Αν η αναζήτηση αποτύχει ή αργήσει, η σελίδα το βρίσκει μόνη της όπως πριν.

// Υπαρκτές σελίδες/φάκελοι του site: περνάνε ανέγγιχτοι
const PAGES = new Set([
  'admin', 'superadmin', 'partners', 'privacy', 'terms', 'site', 'en', 'de', 'fr', 'it', 'es', 'tr', 'pt',
  'api', 'downloads', 'netlify', 'cancel', 'embed', 'index', 'claim',
  // ελληνικές σελίδες του site
  'leitourgies', 'times'
]);

const DB = 'https://reser-dfb9a-default-rtdb.europe-west1.firebasedatabase.app';

// Δημόσια ανάγνωση από το Firebase (REST), με όριο χρόνου
async function readJson(path, ms = 500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${DB}/${path}.json`, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Ίδια λογική με το /slug (resolve) για τις συνηθισμένες περιπτώσεις
async function lookup(name) {
  const [owner, byIdName] = await Promise.all([
    readJson(`slugs/${name}`),
    readJson(`shop_details/${name}/displayName`),
  ]);
  if (owner && owner.shop) {
    if (owner.active === false) return null;   // παλιό όνομα: η σελίδα θα κάνει την ανακατεύθυνση
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(owner.shop)) return null;
    const exists = await readJson(`shop_details/${owner.shop}/displayName`);
    return exists !== null ? { name, shop: owner.shop, slug: name } : null;
  }
  if (byIdName !== null) return { name, shop: name, slug: null };   // παλιά καταστήματα: το ID ως διεύθυνση
  return null;
}

export default async (request, context) => {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === '/') {
    if (!url.searchParams.has('shop')) return context.rewrite('/partners/index.html');
    return context.next();
  }

  const m = path.match(/^\/([A-Za-z0-9][A-Za-z0-9_-]{1,39})\/?$/);
  if (!m) return context.next();

  const name = m[1];
  const lower = name.toLowerCase();
  if (PAGES.has(lower)) return context.next();

  // Κεφαλαία ή τελική κάθετος -> μία καθαρή διεύθυνση
  if (name !== lower || path.endsWith('/')) {
    return Response.redirect(`${url.origin}/${lower}${url.search}`, 301);
  }

  const [res, info] = await Promise.all([
    context.rewrite('/index.html' + url.search),
    lookup(lower).catch(() => null),
  ]);
  if (!info || !res.ok) return res;

  const html = await res.text();
  const tag = `<script>window.__TR=${JSON.stringify(info).replace(/</g, '\\u003c')};</script>`;
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  return new Response(html.replace('<head>', '<head>' + tag), { status: res.status, headers });
};

export const config = {
  path: '/*',
  excludedPath: [
    '/.netlify/*', '/__/*',
    '/*.js', '/*.css', '/*.svg', '/*.png', '/*.jpg', '/*.jpeg', '/*.webp', '/*.ico',
    '/*.txt', '/*.xml', '/*.json', '/*.html', '/*.md', '/*.woff2'
  ]
};
