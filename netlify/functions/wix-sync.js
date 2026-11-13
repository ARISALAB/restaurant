// Καθημερινός συγχρονισμός συνδρομών Wix -> TableReserve (paidUntil κ.λπ.)
// Χρειάζεται για ανανεώσεις, ακυρώσεις και μηνιαία πλάνα, όταν ο ιδιοκτήτης δεν ανοίγει το dashboard.
//
// Ελέγχει:
//   1. τις συνδεδεμένες εγκαταστάσεις (wix_sites/<instanceId> = { shop })
//   2. τα καταστήματα που έχουν wixInstanceId αλλά δεν υπάρχουν πια στο wix_sites
//      (ο ιδιοκτήτης αποσύνδεσε ή αφαίρεσε την εφαρμογή)
//
// Στέλνει email στον ιδιοκτήτη του TableReserve όταν ένα κατάστημα Wix αποσυνδέεται/αφαιρεί
// την εφαρμογή, ακυρώνει τη συνδρομή ή γυρίζει σε δωρεάν. Μία φορά ανά γεγονός:
//   shop_details/<shop>/wixNotified/<event> = timestamp
const { Resend } = require('resend');
const { getDb } = require('./_shared/firebase');
const { syncWixBilling } = require('./_shared/wix');

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'TableReserve <noreply@tablereserve.gr>';
const OWNER_EMAIL = process.env.SIGNUP_NOTIFY_EMAIL || 'info@tablereserve.gr';
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LABELS = {
  removed: 'αποσύνδεσε ή αφαίρεσε την εφαρμογή TableReserve από το Wix site του',
  cancelled: 'ακύρωσε τη συνδρομή στο Wix (δεν θα ανανεωθεί)',
  downgraded: 'γύρισε στο δωρεάν πλάνο του Wix',
};
const SUBJECTS = {
  removed: 'αφαίρεσε την εφαρμογή',
  cancelled: 'ακύρωσε τη συνδρομή',
  downgraded: 'γύρισε σε δωρεάν',
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
        <b>Πακέτο:</b> ${esc(d.wixPackage || '-')} (${esc(d.billingStatus || '-')})<br>
        <b>Ενεργό στο TableReserve έως:</b> ${esc(until)}<br>
        <b>Wix instance:</b> ${esc(instanceId || '-')}</p>
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

// Συγχρονίζει ένα κατάστημα και αποφασίζει αν χρειάζεται ειδοποίηση
async function handleShop(db, instanceId, shop, connected, stats) {
  const shopRef = db.ref(`shop_details/${shop}`);
  const before = (await shopRef.get()).val() || {};
  const notified = before.wixNotified || {};

  let res = null;
  try { res = await syncWixBilling(db, instanceId, shop); }
  catch (e) { console.warn('[wix-sync] sync', shop, e && e.message); }
  res ? stats.ok++ : stats.fail++;

  const after = (await shopRef.get()).val() || {};
  const events = [];

  if (!connected && !notified.removed) events.push('removed');
  if (res) {
    const wasPaid = before.billingSource === 'wix' && /active|trial/.test(before.billingStatus || '');
    if (res.isFree && before.wixPackage && !notified.downgraded) events.push('downgraded');
    else if (wasPaid && after.billingStatus === 'cancelled' && !notified.cancelled) events.push('cancelled');
  }

  // Συνδεδεμένο, πληρωμένο και όχι ακυρωμένο: μηδενίζουμε για μελλοντικές ειδοποιήσεις
  if (connected && res && res.paid && after.billingStatus !== 'cancelled' && (before.wixNotified || before.wixRemovedAt)) {
    await shopRef.update({ wixNotified: null, wixRemovedAt: null });
  }

  for (const ev of events) {
    if (await notify(ev, shop, after, instanceId)) {
      stats.sent++;
      const upd = { [`wixNotified/${ev}`]: Date.now() };
      if (ev === 'removed') upd.wixRemovedAt = Date.now();
      await shopRef.update(upd);
    }
  }
}

exports.handler = async () => {
  if (!process.env.WIX_APP_SECRET) { console.warn('[wix-sync] WIX_APP_SECRET missing'); return { statusCode: 200, body: 'skipped' }; }
  const db = getDb();
  const sites = (await db.ref('wix_sites').get()).val() || {};
  const shops = (await db.ref('shop_details').get()).val() || {};
  const stats = { ok: 0, fail: 0, sent: 0, disconnected: 0 };

  // 1. Συνδεδεμένες εγκαταστάσεις
  const linked = new Set();
  for (const [instanceId, link] of Object.entries(sites)) {
    if (!link || !link.shop) continue;
    linked.add(link.shop);
    await handleShop(db, instanceId, link.shop, true, stats);
  }

  // 2. Καταστήματα Wix που δεν είναι πια συνδεδεμένα
  for (const [shop, d] of Object.entries(shops)) {
    if (!d || !d.wixInstanceId || linked.has(shop)) continue;
    stats.disconnected++;
    await handleShop(db, d.wixInstanceId, shop, false, stats);
  }

  console.log('[wix-sync]', stats);
  return { statusCode: 200, body: JSON.stringify(stats) };
};
