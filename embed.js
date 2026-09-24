/*!
 * TableReserve embed · https://tablereserve.gr
 *
 * Inline form:
 *   <div data-tablereserve="your-shop-id"></div>
 *   <script src="https://tablereserve.gr/embed.js" async></script>
 *
 * Button that opens the form in a popup:
 *   <div data-tablereserve="your-shop-id" data-mode="button" data-label="Book a table"></div>
 *
 * Optional: data-lang="en" | "el", data-color="#2563eb"
 */
(function () {
  'use strict';
  if (window.__tablereserveEmbed) { window.__tablereserveEmbed.scan(); return; }

  var ORIGIN = 'https://tablereserve.gr';
  var frames = [];

  function src(shop, lang) {
    var u = ORIGIN + '/?shop=' + encodeURIComponent(shop) + '&embed=1';
    if (lang === 'el' || lang === 'en') u += '&lang=' + lang;
    return u;
  }

  function makeFrame(shop, lang, minHeight) {
    var f = document.createElement('iframe');
    f.src = src(shop, lang);
    f.title = 'Online reservations';
    f.loading = 'lazy';
    f.setAttribute('allow', 'clipboard-write');
    f.style.cssText = 'width:100%;border:0;display:block;min-height:' + (minHeight || 620) + 'px;height:' + (minHeight || 620) + 'px;background:transparent;color-scheme:normal;';
    frames.push(f);
    return f;
  }

  function mountInline(el, shop, lang) {
    el.innerHTML = '';
    el.appendChild(makeFrame(shop, lang, 620));
  }

  var overlay, overlayFrame;
  function openPopup(shop, lang) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.6);display:flex;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px 12px;';
      var box = document.createElement('div');
      box.style.cssText = 'position:relative;width:100%;max-width:760px;background:#f8fafc;border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.35);';
      var close = document.createElement('button');
      close.type = 'button';
      close.setAttribute('aria-label', 'Close');
      close.innerHTML = '&times;';
      close.style.cssText = 'position:absolute;top:8px;right:10px;z-index:2;width:36px;height:36px;border:0;border-radius:50%;background:#fff;color:#0f172a;font:600 22px/36px system-ui,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);';
      close.onclick = closePopup;
      overlay.onclick = function (e) { if (e.target === overlay) closePopup(); };
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePopup(); });
      box.appendChild(close);
      overlay.appendChild(box);
      overlay._box = box;
    }
    if (overlayFrame) overlayFrame.remove();
    overlayFrame = makeFrame(shop, lang, 560);
    overlayFrame.style.borderRadius = '16px';
    overlay._box.appendChild(overlayFrame);
    overlay._prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(overlay);
  }
  function closePopup() {
    if (!overlay || !overlay.parentNode) return;
    overlay.parentNode.removeChild(overlay);
    document.documentElement.style.overflow = overlay._prevOverflow || '';
  }

  function mountButton(el, shop, lang) {
    var label = el.getAttribute('data-label') || (lang === 'el' ? 'Κράτηση τραπεζιού' : 'Book a table');
    var color = el.getAttribute('data-color') || '#2563eb';
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'background:' + color + ';color:#fff;border:0;border-radius:10px;padding:13px 24px;font:600 16px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;';
    b.onclick = function () { openPopup(shop, lang); };
    el.innerHTML = '';
    el.appendChild(b);
  }

  function scan() {
    var nodes = document.querySelectorAll('[data-tablereserve]:not([data-tr-ready])');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var shop = (el.getAttribute('data-tablereserve') || '').trim();
      if (!shop) continue;
      el.setAttribute('data-tr-ready', '1');
      var lang = el.getAttribute('data-lang');
      if (el.getAttribute('data-mode') === 'button') mountButton(el, shop, lang);
      else mountInline(el, shop, lang);
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== ORIGIN || !e.data || e.data.source !== 'tablereserve') return;
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (f.contentWindow !== e.source) continue;
      if (e.data.type === 'height' && e.data.height > 0) {
        var h = Math.ceil(e.data.height) + 'px';
        f.style.height = h;
        f.style.minHeight = h;
      } else if (e.data.type === 'scrollTop' && f !== overlayFrame) {
        var top = f.getBoundingClientRect().top + window.pageYOffset - 16;
        window.scrollTo({ top: top, behavior: 'smooth' });
      } else if (e.data.type === 'scrollTop' && overlay) {
        overlay.scrollTop = 0;
      }
    }
  });

  window.__tablereserveEmbed = { scan: scan, open: openPopup };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
})();
