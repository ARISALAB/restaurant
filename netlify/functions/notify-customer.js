const { Resend } = require('resend');
const { getDb } = require('./_shared/firebase');
const { json, preflightOk } = require('./_shared/respond');
const { locationLabel } = require('./_shared/location');
const { googleCalendarUrl, icsUrl } = require('./_shared/calendar');
const { shopTz } = require('./_shared/time');
const { normLang, msg, fmtDate, occasionLabel } = require('./_shared/i18n');
const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const resend = new Resend(process.env.RESEND_API_KEY);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflightOk();
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const { shopId, bookingId, cancelToken, lang } = JSON.parse(event.body || '{}');
    if (!shopId || !bookingId || !cancelToken)
      return json(400, { error: 'shopId, bookingId, cancelToken απαιτούνται' });

    const db = getDb();
    const bookingSnap = await db.ref(`reservations/${shopId}/${bookingId}`).get();
    if (!bookingSnap.exists())
      return json(404, { error: 'Κράτηση δεν βρέθηκε' });

    const booking = bookingSnap.val();
    if (!booking.email)
      return json(200, { message: 'Χωρίς email πελάτη — παραλείφθηκε' });

    const shopSnap = await db.ref(`shop_details/${shopId}`).get();
    const shopName = shopSnap.exists()
      ? (shopSnap.val().displayName || shopId)
      : shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, ' ');

    const address = (await db.ref(`shop_profile/${shopId}/info/address`).get()).val() || '';
    const tz = await shopTz(db, shopId);
    const gcalUrl = googleCalendarUrl({ b: booking, shopName, address, lang: normLang(lang), tz });
    const appleUrl = icsUrl({ shopId, bookingId, cancelToken, lang: normLang(lang) });
    const walletUrl = process.env.GOOGLE_WALLET_ISSUER_ID
      ? 'https://tablereserve.gr/.netlify/functions/wallet?' + new URLSearchParams({ shop: shopId, id: bookingId, t: cancelToken, lang: normLang(lang) }).toString()
      : null;

    const cancelUrl = `https://tablereserve.gr/cancel.html?token=${cancelToken}&shop=${shopId}&id=${bookingId}&lang=${normLang(lang)}`;

    const L = normLang(lang);
    const m = msg(L);
    const txt = {
      subject:      `✅ ${m.c_subject} - ${shopName} | ${booking.date} ${booking.time}`,
      header:       m.c_header,
      greeting:     m.dear(esc(booking.name)),
      confirmed:    m.c_confirmed,
      persons:      m.persons,
      location_lbl: m.c_location,
      occasion_lbl: m.c_occasion,
      comments_lbl: m.c_comments,
      no_pref:      m.no_pref,
      cal_title:    m.c_cal,
      cal_google:   m.c_cal_google,
      cal_other:    m.c_cal_other,
      cancel_q:     m.c_cancel_q,
      cancel_btn:   m.c_cancel_btn,
      cancel_note:  m.c_cancel_note,
      footer:       'TableReserve &bull; noreply@tablereserve.gr',
    };

    await resend.emails.send({
      from: 'TableReserve <noreply@tablereserve.gr>',
      to: booking.email,
      subject: txt.subject,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f0f2f5;margin:0;padding:20px;">
  <div style="max-width:580px;margin:0 auto;">

    <div style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">🍽️</div>
      <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700;">${txt.header}</h1>
      <p style="color:rgba(255,255,255,0.8);margin:6px 0 0;font-size:14px;">${esc(shopName)}</p>
    </div>

    <div style="background:#fff;padding:28px 32px;">
      <p style="color:#1e293b;font-size:15px;margin-bottom:4px;">${txt.greeting}</p>
      <p style="color:#64748b;font-size:14px;margin-bottom:24px;">${txt.confirmed}</p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
        <p style="margin:0;color:#1d4ed8;font-size:22px;font-weight:700;">${esc(fmtDate(booking.date, L))} &bull; ${esc(booking.time)}</p>
        <p style="margin:4px 0 0;color:#3b82f6;font-size:14px;">${esc(booking.guests)} ${txt.persons} &bull; ${esc(shopName)}</p>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;width:40%;">${txt.location_lbl}</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${esc(locationLabel(booking.location, L)) || txt.no_pref}</td>
        </tr>
        ${booking.occasion ? `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">${txt.occasion_lbl}</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${esc(occasionLabel(booking.occasion, L))}</td>
        </tr>` : ''}
        ${booking.comments ? `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:600;color:#64748b;font-size:13px;">${txt.comments_lbl}</td>
          <td style="padding:10px 12px;background:#fff;border:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${esc(booking.comments)}</td>
        </tr>` : ''}
      </table>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;margin-bottom:16px;">
        <p style="color:#334155;font-size:13px;font-weight:600;margin:0 0 12px;">${txt.cal_title}</p>
        <a href="${gcalUrl}" style="display:inline-block;background:#fff;color:#1d4ed8;border:1px solid #bfdbfe;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;margin:4px;">${txt.cal_google}</a>
        <a href="${appleUrl}" style="display:inline-block;background:#fff;color:#1d4ed8;border:1px solid #bfdbfe;padding:10px 18px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;margin:4px;">${txt.cal_other}</a>
        ${walletUrl ? `<div style="margin-top:10px;"><a href="${walletUrl}" style="display:inline-block;padding:8px;"><img src="https://tablereserve.gr/wallet/${L === 'el' ? 'add-el.png' : 'add-en.png'}" alt="${m.wallet_alt}" height="48" style="height:48px;width:auto;border:0;display:block;"></a></div>` : ''}
      </div>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:20px;text-align:center;">
        <p style="color:#991b1b;font-size:13px;font-weight:600;margin:0 0 12px;">${txt.cancel_q}</p>
        <a href="${cancelUrl}"
           style="display:inline-block;background:#ef4444;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;">
          ${txt.cancel_btn}
        </a>
        <p style="color:#94a3b8;font-size:11px;margin:12px 0 0;">${txt.cancel_note}</p>
      </div>
    </div>

    <div style="background:#f8fafc;border-radius:0 0 12px 12px;padding:16px;text-align:center;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">${txt.footer}</p>
    </div>

  </div>
</body>
</html>`,
    });

    return json(200, { success: true, sentTo: booking.email });
  } catch (err) {
    console.error('[notify-customer] error:', err);
    return json(500, { error: 'Αποτυχία αποστολής', details: err.message });
  }
};
