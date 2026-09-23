// Κοινά εργαλεία για την εγγραφή εστιατορίων
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'TableReserve <noreply@tablereserve.gr>';
const OWNER_EMAIL = process.env.SIGNUP_NOTIFY_EMAIL || 'info@tablereserve.gr';
const ADMIN_URL = 'https://tablereserve.gr/admin';

// Ελληνικά -> λατινικά για το ID καταστήματος
const GR = {α:'a',ά:'a',β:'v',γ:'g',δ:'d',ε:'e',έ:'e',ζ:'z',η:'i',ή:'i',θ:'th',ι:'i',ί:'i',ϊ:'i',ΐ:'i',κ:'k',λ:'l',μ:'m',ν:'n',ξ:'x',ο:'o',ό:'o',π:'p',ρ:'r',σ:'s',ς:'s',τ:'t',υ:'y',ύ:'y',ϋ:'y',ΰ:'y',φ:'f',χ:'ch',ψ:'ps',ω:'o',ώ:'o'};

function slugify(name) {
  const s = String(name).toLowerCase().replace(/ου/g, 'ou').replace(/ού/g, 'ou').replace(/μπ/g, 'b').replace(/ντ/g, 'nt')
    .replace(/[α-ωάέήίόύώϊϋΐΰς]/g, c => GR[c] || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 30).replace(/_+$/, '');
  return s.length >= 2 ? s : 'shop';
}

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

const T = {
  el: {
    subject: 'Επιβεβαιώστε το email σας | TableReserve',
    hello: n => `Καλώς ήρθατε στο TableReserve, ${n}!`,
    body: 'Πατήστε το κουμπί για να επιβεβαιώσετε το email σας και να ενεργοποιηθεί το κατάστημά σας.',
    btn: 'Επιβεβαίωση email',
    after: 'Μετά την επιβεβαίωση θα μπείτε στον πίνακα διαχείρισης, όπου θα βρείτε το link κρατήσεων του καταστήματός σας.',
    ignore: 'Αν δεν δημιουργήσατε εσείς λογαριασμό, αγνοήστε αυτό το email.'
  },
  en: {
    subject: 'Confirm your email | TableReserve',
    hello: n => `Welcome to TableReserve, ${n}!`,
    body: 'Click the button to confirm your email address and activate your restaurant.',
    btn: 'Confirm email',
    after: 'Once confirmed, you will land in your dashboard, where you will find your restaurant\'s booking link.',
    ignore: 'If you did not create an account, you can ignore this email.'
  }
};

async function sendVerificationEmail({ to, shopName, link, lang }) {
  const t = T[lang] || T.el;
  return resend.emails.send({
    from: FROM,
    to,
    subject: t.subject,
    html: `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="background:#2563eb;padding:24px 32px;color:#fff;font-size:22px;font-weight:700;">TableReserve</div>
    <div style="padding:32px;">
      <h1 style="font-size:20px;color:#1e293b;margin:0 0 16px;">${esc(t.hello(shopName))}</h1>
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">${t.body}</p>
      <p style="text-align:center;margin:0 0 24px;">
        <a href="${esc(link)}" style="display:inline-block;background:#2563eb;color:#fff;padding:14px 30px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">${t.btn}</a>
      </p>
      <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">${t.after}</p>
      <p style="color:#94a3b8;font-size:12px;margin:0;">${t.ignore}</p>
    </div>
  </div>
</body></html>`
  });
}

async function notifyOwner({ shopId, shopName, email, phone, type, plan }) {
  return resend.emails.send({
    from: FROM,
    to: OWNER_EMAIL,
    subject: `Νέα εγγραφή: ${shopName} (${shopId})`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;">
      <h2 style="margin:0 0 12px;">Νέα εγγραφή στο TableReserve</h2>
      <p><b>Κατάστημα:</b> ${esc(shopName)}<br><b>ID:</b> ${esc(shopId)}<br><b>Email:</b> ${esc(email)}<br>
      <b>Τηλέφωνο:</b> ${esc(phone || '-')}<br><b>Τύπος:</b> ${esc(type || '-')}<br><b>Πλάνο που επέλεξε:</b> ${esc(plan || '-')}</p>
      <p>Κατάσταση: σε αναμονή επιβεβαίωσης email.</p>
    </div>`
  });
}

module.exports = { slugify, sendVerificationEmail, notifyOwner, ADMIN_URL };
