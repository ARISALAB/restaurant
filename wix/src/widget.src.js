/*!
 * TableReserve · Wix site widget (custom element <tablereserve-booking>)
 *
 * Πηγαίος κώδικας. Το αρχείο που φορτώνει το Wix είναι το /wix/widget.js (bundle).
 * Μετά από αλλαγή εδώ, ξαναφτιάξτε το bundle (σε φάκελο εκτός repo, π.χ. C:\wixbuild):
 *   npm i @wix/sdk @wix/site esbuild
 *   set NODE_PATH=C:\wixbuild\node_modules   (Git Bash: export NODE_PATH=...)
 *   npx esbuild <repo>/wix/src/widget.src.js --bundle --minify --format=iife --target=es2019 --outfile=<repo>/wix/widget.js
 *
 * Πώς βρίσκει το κατάστημα: ζητά από το Wix ένα access token του site (fetchWithAuth)
 * και το στέλνει στο /.netlify/functions/wix-shop. Η function το επαληθεύει στο Wix,
 * παίρνει το instanceId και βρίσκει ποιο κατάστημα έχει συνδέσει ο ιδιοκτήτης.
 */
import { createClient } from '@wix/sdk';
import { site } from '@wix/site';

const APP_ID = 'eb40160f-f428-4f89-b863-9d40b4241649';
const ORIGIN = 'https://tablereserve.gr';
const LANGS = /^(el|en|de|fr|it|es|tr|pt)$/;

const client = createClient({
  auth: site.auth(),
  host: site.host({ applicationId: APP_ID }),
});

// Το Wix δίνει το access token λίγο μετά τη φόρτωση (στο δημοσιευμένο site συχνά αργότερα
// απ' ό,τι στον Editor). Περιμένουμε να έρθει πριν ρωτήσουμε το TableReserve.
const injectToken = client.auth.getAccessTokenInjector();
let markTokenReady;
const tokenReady = new Promise(res => { markTokenReady = res; });
const sleep = ms => new Promise(res => setTimeout(res, ms));
const log = (...a) => { try { console.info('[TableReserve]', ...a); } catch (e) {} };

const TXT = {
  en: {
    loading: 'Loading reservations…',
    title: 'Connect your restaurant',
    body: 'In your Wix dashboard, open Apps → TableReserve and connect your TableReserve account. The booking form will appear here.',
  },
  el: {
    loading: 'Φόρτωση κρατήσεων…',
    title: 'Συνδέστε το κατάστημά σας',
    body: 'Στον πίνακα ελέγχου του Wix ανοίξτε Εφαρμογές → TableReserve και συνδέστε τον λογαριασμό σας στο TableReserve. Η φόρμα κράτησης θα εμφανιστεί εδώ.',
  },
};

function pageLang() {
  const l = (document.documentElement.lang || navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS.test(l) ? l : 'en';
}

class TableReserveBooking extends HTMLElement {
  constructor() {
    super();
    // Το Wix καλεί αυτή τη συνάρτηση για να δώσει access token στον client
    this.accessTokenListener = (...args) => {
      const out = injectToken(...args);
      markTokenReady();
      return out;
    };
    this._frame = null;
    this._onMessage = this._onMessage.bind(this);
  }

  connectedCallback() {
    // Το Wix δίνει στο widget σταθερό ύψος (αυτό που ορίζει ο ιδιοκτήτης στον Editor) και δεν
    // το μεγαλώνει. Γεμίζουμε αυτό το ύψος και η φόρμα κυλάει μέσα στο iframe.
    this.style.display = 'block';
    this.style.height = '100%';
    this.style.minHeight = '480px';
    this.style.overflow = 'hidden';
    window.addEventListener('message', this._onMessage);
    if (this._started) return;
    this._started = true;
    this._box('loading');
    this._load();
  }

  disconnectedCallback() {
    window.removeEventListener('message', this._onMessage);
  }

  async _load() {
    await Promise.race([tokenReady, sleep(6000)]);
    let d = null;
    const waits = [0, 600, 1200, 2500, 4000, 6000];
    for (let i = 0; i < waits.length && !d; i++) {
      if (waits[i]) await sleep(waits[i]);
      try {
        const r = await client.fetchWithAuth(ORIGIN + '/.netlify/functions/wix-shop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        if (r.ok) d = await r.json();
        else log('wix-shop', r.status, 'attempt', i + 1);
      } catch (e) {
        log('wix-shop failed', (e && e.message) || e, 'attempt', i + 1);
      }
    }
    log('result', d && { connected: d.connected, shop: d.shop });
    if (d && d.connected && d.shop) this._mountFrame(d.shop);
    else this._box('setup');
  }

  _box(kind) {
    const t = TXT[pageLang() === 'el' ? 'el' : 'en'];
    const wrap = document.createElement('div');
    wrap.style.cssText = 'font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;' +
      'border:1px dashed #94a3b8;border-radius:14px;padding:28px 22px;text-align:center;background:#f8fafc;';
    if (kind === 'loading') {
      wrap.style.borderStyle = 'solid';
      wrap.style.borderColor = '#e2e8f0';
      wrap.textContent = t.loading;
    } else {
      const h = document.createElement('div');
      h.style.cssText = 'font-weight:700;font-size:17px;margin-bottom:6px;';
      h.textContent = t.title;
      const p = document.createElement('div');
      p.style.cssText = 'color:#475569;max-width:460px;margin:0 auto;';
      p.textContent = t.body;
      wrap.append(h, p);
    }
    this.replaceChildren(wrap);
  }

  _mountFrame(shop) {
    const lang = pageLang();
    const f = document.createElement('iframe');
    f.src = ORIGIN + '/?shop=' + encodeURIComponent(shop) + '&embed=1&src=site' + (LANGS.test(lang) ? '&lang=' + lang : '');
    f.title = 'Online reservations';
    f.setAttribute('allow', 'clipboard-write');
    // Ποτέ ψηλότερο από την οθόνη (αφήνουμε χώρο για header του site), ώστε να φαίνεται
    // ολόκληρο, μαζί με το κουμπί «Συνέχεια» στο κάτω μέρος.
    f.style.cssText = 'width:100%;height:100%;min-height:480px;max-height:calc(100vh - 140px);border:0;display:block;background:transparent;color-scheme:normal;';
    f.setAttribute('scrolling', 'yes');
    this._frame = f;
    this.replaceChildren(f);
  }

  // Η σελίδα κράτησης στέλνει ύψος/scroll (ίδιο πρωτόκολλο με το embed.js). Εδώ δεν αλλάζουμε
  // ύψος (κυλάει μέσα στο iframe)· μόνο φέρνουμε τη φόρμα στην οθόνη όταν ανοίγει το επόμενο βήμα.
  _onMessage(e) {
    const f = this._frame;
    if (!f || e.origin !== ORIGIN || !e.data || e.data.source !== 'tablereserve' || f.contentWindow !== e.source) return;
    if (e.data.type === 'scrollTop') {
      const r = f.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.4) {
        window.scrollTo({ top: r.top + window.pageYOffset - 16, behavior: 'smooth' });
      }
    }
  }
}

if (!customElements.get('tablereserve-booking')) {
  customElements.define('tablereserve-booking', TableReserveBooking);
}
