// 1. tablereserve.gr/              -> δείχνει τη σελίδα partners (η διεύθυνση μένει ίδια)
// 2. tablereserve.gr/<όνομα>       -> δείχνει τη σελίδα κράτησης του καταστήματος
//    Η σελίδα κράτησης βρίσκει μόνη της ποιο κατάστημα είναι από το path.

// Υπαρκτές σελίδες/φάκελοι του site: περνάνε ανέγγιχτοι
const PAGES = new Set([
  'admin', 'superadmin', 'partners', 'privacy', 'terms', 'site', 'en',
  'api', 'downloads', 'netlify', 'cancel', 'embed', 'index'
]);

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

  return context.rewrite('/index.html' + url.search);
};

export const config = {
  path: '/*',
  excludedPath: [
    '/.netlify/*', '/__/*',
    '/*.js', '/*.css', '/*.svg', '/*.png', '/*.jpg', '/*.jpeg', '/*.webp', '/*.ico',
    '/*.txt', '/*.xml', '/*.json', '/*.html', '/*.md', '/*.woff2'
  ]
};
