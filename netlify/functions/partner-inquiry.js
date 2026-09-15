const { Resend } = require('resend');
const { json, preflightOk } = require('./_shared/respond');

const resend = new Resend(process.env.RESEND_API_KEY);
const NOTIFY_EMAIL = process.env.PARTNER_NOTIFY_EMAIL || 'akronservices@mail.com';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const data = JSON.parse(event.body || '{}');
    const name    = data['όνομα']      || '';
    const phone   = data['τηλέφωνο']   || '';
    const email   = data['email']      || '';
    const shop    = data['κατάστημα']  || '';
    const type    = data['τύπος']      || '';
    const plan    = data['πλάνο']      || 'Δεν επιλέχθηκε πλάνο';
    const comments = data['σχόλια']    || '';

    if (!name || !phone || !email || !shop) {
      return json(400, { error: 'Λείπουν υποχρεωτικά πεδία' });
    }

    // 1) Notify the business
    await resend.emails.send({
      from: 'TableReserve <noreply@tablereserve.gr>',
      to: NOTIFY_EMAIL,
      replyTo: email,
      subject: `📩 Νέα αίτηση συνεργασίας — ${shop} (${plan})`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:24px 32px;">
      <h1 style="color:#fff;margin:0;font-size:18px;">Νέα αίτηση συνεργασίας</h1>
      <p style="color:rgba(255,255,255,.8);margin:6px 0 0;font-size:13px;">${plan}</p>
    </div>
    <div style="background:#fff;padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;width:35%;">Κατάστημα</td><td style="padding:8px 0;font-size:14px;">${shop}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Υπεύθυνος</td><td style="padding:8px 0;font-size:14px;">${name}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Τηλέφωνο</td><td style="padding:8px 0;font-size:14px;"><a href="tel:${phone}">${phone}</a></td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Email</td><td style="padding:8px 0;font-size:14px;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Τύπος</td><td style="padding:8px 0;font-size:14px;">${type || '-'}</td></tr>
        <tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Πλάνο</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#2563eb;">${plan}</td></tr>
        ${comments ? `<tr><td style="padding:8px 0;color:#64748b;font-size:13px;">Σχόλια</td><td style="padding:8px 0;font-size:14px;">${comments}</td></tr>` : ''}
      </table>
    </div>
  </div>
</body>
</html>`,
    });

    // 2) Confirm to the person who submitted
    await resend.emails.send({
      from: 'TableReserve <noreply@tablereserve.gr>',
      to: email,
      subject: `Λάβαμε το αίτημά σας — TableReserve`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;">
    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-size:28px;margin-bottom:8px;">✅</div>
      <h1 style="color:#fff;margin:0;font-size:20px;">Λάβαμε το αίτημά σας!</h1>
    </div>
    <div style="background:#fff;padding:28px 32px;">
      <p style="color:#1e293b;font-size:15px;">Γεια σας <strong>${name}</strong>,</p>
      <p style="color:#475569;font-size:14px;line-height:1.6;">
        Ευχαριστούμε για το ενδιαφέρον σας για το TableReserve! Λάβαμε την αίτησή σας
        για το <strong>${shop}</strong> με το πλάνο <strong style="color:#2563eb;">${plan}</strong>.
        Η ομάδα μας θα επικοινωνήσει μαζί σας εντός 24 ωρών στο τηλέφωνο ή το email που μας δώσατε.
      </p>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-top:20px;">
        <p style="margin:0;color:#1d4ed8;font-size:13px;font-weight:700;">Στοιχεία αίτησης</p>
        <p style="margin:8px 0 0;color:#334155;font-size:13px;">🏪 ${shop}<br>📞 ${phone}<br>💼 ${plan}</p>
      </div>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;">
        Αν έχετε ερωτήσεις στο μεταξύ, απαντήστε απευθείας σε αυτό το email.
      </p>
    </div>
    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve &bull; noreply@tablereserve.gr</p>
    </div>
  </div>
</body>
</html>`,
    });

    return json(200, { success: true });
  } catch (err) {
    console.error('[partner-inquiry] error:', err);
    return json(500, { error: 'Αποτυχία αποστολής', details: err.message });
  }
};
