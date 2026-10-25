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
  },
  de: {
    subject: 'Bestätigen Sie Ihre E-Mail | TableReserve',
    hello: n => `Willkommen bei TableReserve, ${n}!`,
    body: 'Klicken Sie auf den Button, um Ihre E-Mail-Adresse zu bestätigen und Ihr Restaurant zu aktivieren.',
    btn: 'E-Mail bestätigen',
    after: 'Nach der Bestätigung gelangen Sie in Ihr Dashboard, wo Sie den Reservierungslink Ihres Restaurants finden.',
    ignore: 'Wenn Sie kein Konto angelegt haben, können Sie diese E-Mail ignorieren.'
  },
  fr: {
    subject: 'Confirmez votre e-mail | TableReserve',
    hello: n => `Bienvenue sur TableReserve, ${n} !`,
    body: 'Cliquez sur le bouton pour confirmer votre adresse e-mail et activer votre restaurant.',
    btn: "Confirmer l'e-mail",
    after: 'Une fois la confirmation faite, vous arriverez sur votre tableau de bord, où vous trouverez le lien de réservation de votre restaurant.',
    ignore: "Si vous n'avez pas créé de compte, ignorez cet e-mail."
  },
  it: {
    subject: 'Conferma la tua email | TableReserve',
    hello: n => `Benvenuto su TableReserve, ${n}!`,
    body: 'Clicca il pulsante per confermare il tuo indirizzo email e attivare il tuo locale.',
    btn: 'Conferma email',
    after: 'Dopo la conferma entrerai nella tua dashboard, dove troverai il link di prenotazione del tuo locale.',
    ignore: "Se non hai creato tu un account, ignora quest'email."
  },
  es: {
    subject: 'Confirma tu email | TableReserve',
    hello: n => `¡Bienvenido a TableReserve, ${n}!`,
    body: 'Pulsa el botón para confirmar tu dirección de email y activar tu restaurante.',
    btn: 'Confirmar email',
    after: 'Tras confirmarlo entrarás en tu panel, donde encontrarás el enlace de reservas de tu restaurante.',
    ignore: 'Si no has creado ninguna cuenta, ignora este email.'
  },
  tr: {
    subject: 'E-postanızı doğrulayın | TableReserve',
    hello: n => `TableReserve’e hoş geldiniz, ${n}!`,
    body: 'E-posta adresinizi doğrulamak ve restoranınızı etkinleştirmek için düğmeye tıklayın.',
    btn: 'E-postayı doğrula',
    after: 'Doğrulamadan sonra panelinize yönlendirileceksiniz; restoranınızın rezervasyon bağlantısını orada bulabilirsiniz.',
    ignore: 'Hesap oluşturmadıysanız bu e-postayı dikkate almayın.'
  },
  pt: {
    subject: 'Confirme o seu email | TableReserve',
    hello: n => `Bem-vindo ao TableReserve, ${n}!`,
    body: 'Clique no botão para confirmar o seu endereço de email e ativar o seu restaurante.',
    btn: 'Confirmar email',
    after: 'Depois de confirmar, entra no seu painel, onde encontra o link de reservas do seu restaurante.',
    ignore: 'Se não criou nenhuma conta, ignore este email.'
  }
};

async function sendVerificationEmail({ to, shopName, link, lang }) {
  const t = T[lang] || T.el;
  const { data, error } = await resend.emails.send({
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
  if (error) throw new Error('resend: ' + (error.message || JSON.stringify(error)));
  return data;
}

async function notifyOwner({ shopId, shopName, email, phone, type, plan, status = 'σε αναμονή επιβεβαίωσης email' }) {
  return resend.emails.send({
    from: FROM,
    to: OWNER_EMAIL,
    subject: `Νέα εγγραφή: ${shopName} (${shopId})`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1e293b;">
      <h2 style="margin:0 0 12px;">Νέα εγγραφή στο TableReserve</h2>
      <p><b>Κατάστημα:</b> ${esc(shopName)}<br><b>ID:</b> ${esc(shopId)}<br><b>Email:</b> ${esc(email)}<br>
      <b>Τηλέφωνο:</b> ${esc(phone || '-')}<br><b>Τύπος:</b> ${esc(type || '-')}<br><b>Πλάνο που επέλεξε:</b> ${esc(plan || '-')}</p>
      <p>Κατάσταση: ${esc(status)}.</p>
    </div>`
  });
}

module.exports = { slugify, sendVerificationEmail, notifyOwner, ADMIN_URL };
