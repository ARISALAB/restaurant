// Emails προς το εστιατόριο (νέα κράτηση / ακύρωση), στη γλώσσα του καταστήματος
const { locationLabel } = require('./location');
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const T = {
  el: {
    newSubject: (s, b) => `Νέα κράτηση - ${s} | ${b.date || ''} ${b.time || ''} | ${b.name || ''}`,
    newTitle: 'Νέα κράτηση',
    cancelSubject: (s, b) => `❌ Ακύρωση κράτησης - ${s} | ${b.date || ''} ${b.time || ''} | ${b.name || ''}`,
    cancelTitle: 'Ακύρωση κράτησης', byGuest: 'από τον πελάτη',
    guests: 'άτομα', name: 'Όνομα', phone: 'Τηλέφωνο', occasion: 'Περίσταση', comments: 'Σχόλια',
    button: 'Δες τις κρατήσεις →'
  },
  en: {
    newSubject: (s, b) => `New reservation - ${s} | ${b.date || ''} ${b.time || ''} | ${b.name || ''}`,
    newTitle: 'New reservation',
    cancelSubject: (s, b) => `❌ Reservation cancelled - ${s} | ${b.date || ''} ${b.time || ''} | ${b.name || ''}`,
    cancelTitle: 'Reservation cancelled', byGuest: 'by the guest',
    guests: 'guests', name: 'Name', phone: 'Phone', occasion: 'Occasion', comments: 'Comments',
    button: 'View reservations →'
  }
};

function row(label, value) {
  if (!value) return '';
  return `<tr>
    <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;width:35%;">${label}</td>
    <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${esc(value)}</td>
  </tr>`;
}

function buildShopEmail(kind, booking, shopName, lang) {
  const t = T[lang === 'en' ? 'en' : 'el'];
  const b = booking || {};
  const cancel = kind === 'cancel';
  const color = cancel ? '#ef4444' : '#2563eb';
  const boxBg = cancel ? '#fef2f2' : '#eff6ff', boxBorder = cancel ? '#fecaca' : '#bfdbfe';
  const boxText = cancel ? '#991b1b' : '#1d4ed8', boxSub = cancel ? '#ef4444' : '#3b82f6';

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:${color};border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">${cancel ? '❌' : '🍽️'}</div>
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${cancel ? t.cancelTitle : t.newTitle}</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">${esc(shopName)}${cancel ? ' &bull; ' + t.byGuest : ''}</p>
    </div>
    <div style="background:#fff;padding:28px 32px;">
      <div style="background:${boxBg};border:1px solid ${boxBorder};border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:${boxText};font-size:22px;font-weight:700;">${esc(b.date || '-')} &bull; ${esc(b.time || '-')}</p>
        <p style="margin:4px 0 0;color:${boxSub};font-size:14px;">${esc(b.guests || '-')} ${t.guests}${b.location ? ' | ' + esc(locationLabel(b.location, lang)) : ''}</p>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        ${row('👤 ' + t.name, b.name || '-')}
        ${row('📞 ' + t.phone, b.phone || '-')}
        ${row('✉️ Email', b.email)}
        ${cancel ? '' : row('🎉 ' + t.occasion, b.occasion)}
        ${cancel ? '' : row('💬 ' + t.comments, b.comments)}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="https://tablereserve.gr/admin" style="display:inline-block;background:#2563eb;color:#fff;padding:13px 28px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">${t.button}</a>
      </div>
    </div>
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve &bull; noreply@tablereserve.gr</p>
    </div>
  </div>
</body></html>`;

  return { subject: cancel ? t.cancelSubject(shopName, b) : t.newSubject(shopName, b), html };
}

module.exports = { buildShopEmail };
