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
      subject:      `${m.c_subject} - ${shopName} | ${booking.date} ${booking.time}`,
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

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-top:1px solid #e2e8f0;margin-bottom:24px;">
        <tr><td style="padding:12px 2px;border-bottom:1px solid #e2e8f0;"><p style="font-size:12px;font-weight:600;color:#64748b;margin:0 0 3px;letter-spacing:0.02em;">${txt.location_lbl}</p><p style="font-size:15px;color:#0f172a;margin:0;word-break:break-word;overflow-wrap:anywhere;">${esc(locationLabel(booking.location, L)) || txt.no_pref}</p></td></tr>
        ${booking.occasion ? `<tr><td style="padding:12px 2px;border-bottom:1px solid #e2e8f0;"><p style="font-size:12px;font-weight:600;color:#64748b;margin:0 0 3px;letter-spacing:0.02em;">${txt.occasion_lbl}</p><p style="font-size:15px;color:#0f172a;margin:0;word-break:break-word;overflow-wrap:anywhere;">${esc(occasionLabel(booking.occasion, L))}</p></td></tr>` : ''}
        ${booking.comments ? `<tr><td style="padding:12px 2px;border-bottom:1px solid #e2e8f0;"><p style="font-size:12px;font-weight:600;color:#64748b;margin:0 0 3px;letter-spacing:0.02em;">${txt.comments_lbl}</p><p style="font-size:15px;color:#0f172a;margin:0;word-break:break-word;overflow-wrap:anywhere;">${esc(booking.comments)}</p></td></tr>` : ''}
      </table>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;text-align:center;margin-bottom:16px;">
        <p style="color:#334155;font-size:13px;font-weight:600;margin:0 0 12px;">${txt.cal_title}</p>
        <a href="${gcalUrl}" style="display:block;max-width:240px;margin:0 auto 8px;background:#fff;color:#1d4ed8;border:1px solid #bfdbfe;padding:11px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;white-space:nowrap;text-align:center;">${txt.cal_google}</a>
        <a href="${appleUrl}" style="display:block;max-width:240px;margin:0 auto 8px;background:#fff;color:#1d4ed8;border:1px solid #bfdbfe;padding:11px 16px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700;white-space:nowrap;text-align:center;">${txt.cal_other}</a>
        ${walletUrl ? `<div style="margin-top:12px;text-align:center;line-height:0;"><a href="${walletUrl}" style="display:inline-block;"><img src="https://tablereserve.gr/wallet/${L === 'el' ? 'add-el.png' : 'add-en.png'}" alt="${m.wallet_alt}" width="${L === 'el' ? 191 : 159}" height="44" style="display:block;width:${L === 'el' ? 191 : 159}px;max-width:100%;height:auto;border:0;"></a></div>` : ''}
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
