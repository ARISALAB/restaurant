// Καθημερινός συγχρονισμός συνδρομών Wix -> TableReserve (paidUntil κ.λπ.)
// Χρειάζεται για ανανεώσεις, ακυρώσεις και μηνιαία πλάνα, όταν ο ιδιοκτήτης δεν ανοίγει το dashboard.
// Επιπλέον: στέλνει email στον ιδιοκτήτη του TableReserve όταν ένα κατάστημα Wix
// ακυρώνει τη συνδρομή, γυρίζει σε δωρεάν ή αφαιρεί την εφαρμογή (μία φορά ανά γεγονός).
const { Resend } = require('resend');
const { getDb } = require('./_shared/firebase');
const { syncWixBilling } = require('./_shared/wix');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'TableReserve <noreply@tablereserve.gr>';
const OWNER_EMAIL = process.env.SIGNUP_NOTIFY_EMAIL || 'info@tablereserve.gr';
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LABELS = {
  cancelled: 'ακύρωσε τη συνδρομή στο Wix (δεν θα ανανεωθεί)',
  downgraded: 'γύρισε στο δωρεάν πλάνο του Wix',
  removed: 'πιθανότατα αφαίρεσε την εφαρμογή από το Wix site (το Wix δεν απαντά για αυτή την εγκατάσταση)',
};
const SUBJECTS = {
  cancelled: 'ακύρωσε τη συνδρομή',
  downgraded: 'γύρισε σε δωρεάν',
  removed: 'αφαίρεσε την εφαρμογή',
};

async function notify(event, shop, d, instanceId) {
  const name = d.displayName || shop;
  const until = d.paidUntil ? new Date(d.paidUntil).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens' }) : '-';
  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: OWNER_EMAIL,
      subject: `Wix: ${name} ${SUBJECTS[event]}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;">
        <h2 style="margin:0 0 12px;">Αλλαγή σε κατάστημα Wix</h2>
        <p><b>${esc(name)}</b> ${esc(LABELS[event])}.</p>
        <p><b>ID:</b> ${esc(shop)}<br><b>Email:</b> ${esc(d.email || '-')}<br>
        <b>Πακέτο:</b> ${esc(d.wixPackage || '-')}<br><b>Ενεργό στο TableReserve έως:</b> ${esc(until)}<br>
        <b>Wix instance:</b> ${esc(instanceId)}</p>
        <p style="color:#64748b;">Ο έλεγχος γίνεται μία φορά τη μέρα, οπότε η αλλαγή μπορεί να έγινε έως 24 ώρες νωρίτερα.</p>
      </div>`,
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    return true;
  } catch (e) {
    console.warn('[wix-sync] notify failed', shop, event, e && e.message);
    return false;
  }
}

exports.handler = async () => {
  if (!process.env.WIX_APP_SECRET) { console.warn('[wix-sync] WIX_APP_SECRET missing'); return { statusCode: 200, body: 'skipped' }; }
  const db = getDb();
  const sites = (await db.ref('wix_sites').get()).val() || {};
  let ok = 0, fail = 0, sent = 0;

  for (const [instanceId, link] of Object.entries(sites)) {
    if (!link || !link.shop) continue;
    const shop = link.shop;
    const notified = link.notified || {};
    const siteRef = db.ref(`wix_sites/${instanceId}`);

    try {
      const before = (await db.ref(`shop_details/${shop}`).get()).val() || {};
      const res = await syncWixBilling(db, instanceId, shop);
      const after = (await db.ref(`shop_details/${shop}`).get()).val() || {};

      let event = null;
      if (!res) {
        fail++;
        // Το Wix δεν δίνει token για εγκατάσταση που αφαιρέθηκε
        if (!notified.removed) event = 'removed';
      } else {
        ok++;
        const wasPaid = before.billingSource === 'wix' && /active|trial/.test(before.billingStatus || '');
        if (res.isFree && before.wixPackage && !notified.downgraded) event = 'downgraded';
        else if (wasPaid && after.billingStatus === 'cancelled' && !notified.cancelled) event = 'cancelled';
        // Ξανά ενεργό και πληρωμένο: μηδενίζουμε τις σημαίες για μελλοντικές ειδοποιήσεις
        if (res.paid && after.billingStatus !== 'cancelled' && Object.keys(notified).length) {
          await siteRef.child('notified').remove();
          await db.ref(`shop_details/${shop}/wixRemovedAt`).remove();
        }
      }

      if (event && await notify(event, shop, { ...before, ...after }, instanceId)) {
        sent++;
        await siteRef.child(`notified/${event}`).set(Date.now());
        if (event === 'removed') await db.ref(`shop_details/${shop}/wixRemovedAt`).set(Date.now());
      }
    } catch (e) { fail++; console.warn('[wix-sync]', instanceId, e && e.message); }
  }

  console.log('[wix-sync]', { ok, fail, sent });
  return { statusCode: 200, body: JSON.stringify({ ok, fail, sent }) };
};
