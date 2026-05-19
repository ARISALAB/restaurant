const express = require("express");
const router = express.Router();
const { Resend } = require("resend");
const { getDb } = require("../firebase");

const resend = new Resend(process.env.RESEND_API_KEY);

router.post("/notify", async (req, res) => {
  try {
    const { shopId, bookingId } = req.body;
    if (!shopId || !bookingId) return res.status(400).json({ error: "shopId και bookingId απαιτούνται" });
    const db = getDb();
    const bookingSnap = await db.ref(`reservations/${shopId}/${bookingId}`).get();
    if (!bookingSnap.exists()) return res.status(200).json({ message: "Κράτηση δεν βρέθηκε" });
    const booking = bookingSnap.val();
    const emailSnap = await db.ref(`shop_profile/${shopId}/info/notificationEmail`).get();
    if (!emailSnap.exists() || !emailSnap.val()) return res.status(200).json({ message: "Δεν υπάρχει notification email" });
    const notificationEmail = emailSnap.val();
    const shopName = shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, " ");

    // 1. ΑΠΟΣΤΟΛΗ EMAIL ΣΤΟ ΜΑΓΑΖΙ
    await resend.emails.send({
      from: "TableReserve <noreply@tablereserve.gr>",
      to: notificationEmail,
      subject: `Νεα Κρατηση - ${shopName} | ${booking.date || ""} ${booking.time || ""} | ${booking.name || ""}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#2563eb;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="color:white;margin:0;">Νεα Κρατηση - ${shopName}</h1>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;">
          <div style="background:#eff6ff;padding:16px;border-radius:8px;text-align:center;margin-bottom:20px;">
            <h2 style="color:#1d4ed8;margin:0;">${booking.date || "-"} | ${booking.time || "-"}</h2>
            <p style="color:#3b82f6;margin:4px 0 0;">${booking.guests || "-"} ατομα${booking.location ? " | " + booking.location : ""}</p>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;color:#64748b;">Ονομα</td><td style="padding:10px;border:1px solid #e2e8f0;">${booking.name || "-"}</td></tr>
            <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;color:#64748b;">Τηλεφωνο</td><td style="padding:10px;border:1px solid #e2e8f0;">${booking.phone || "-"}</td></tr>
            ${booking.email ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;color:#64748b;">Email</td><td style="padding:10px;border:1px solid #e2e8f0;">${booking.email}</td></tr>` : ""}
            ${booking.comments ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;font-weight:bold;color:#64748b;">Σχολια</td><td style="padding:10px;border:1px solid #e2e8f0;">${booking.comments}</td></tr>` : ""}
          </table>
          <div style="text-align:center;margin-top:24px;">
            <a href="https://tablereserve.gr/?shop=${shopId}" style="background:#2563eb;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">Δες τις Κρατησεις</a>
          </div>
        </div>
        <div style="background:#f8fafc;padding:12px;text-align:center;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
          <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve | noreply@tablereserve.gr</p>
        </div>
      </div>`
    });

    // 2. ΑΠΟΣΤΟΛΗ EMAIL ΕΠΙΒΕΒΑΙΩΣΗΣ ΣΤΟΝ ΠΕΛΑΤΗ (Αν υπάρχει δηλωμένο email)
    if (booking.email) {
      await resend.emails.send({
        from: "TableReserve <noreply@tablereserve.gr>",
        to: booking.email,
        subject: `Η κράτησή σας στο ${shopName} επιβεβαιώθηκε!`,
        html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <div style="background:#10b981;padding:24px;text-align:center;border-radius:8px 8px 0 0;">
            <h1 style="color:white;margin:0;">Επιβεβαίωση Κράτησης</h1>
            <p style="color:#d1fae5;margin:4px 0 0;">Ευχαριστούμε για την προτίμηση</p>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;">
            <p>Γεια σας <strong>${booking.name || ""}</strong>,</p>
            <p>Η κράτησή σας στο εστιατόριο <strong>${shopName}</strong> καταχωρήθηκε με επιτυχία. Παρακάτω θα βρείτε τις λεπτομέρειες:</p>
            
            <div style="background:#f0fdf4;padding:16px;border-radius:8px;text-align:center;margin:20px 0;border:1px solid #bbf7d0;">
              <h2 style="color:#15803d;margin:0;">${booking.date || "-"} | ${booking.time || "-"}</h2>
              <p style="color:#166534;margin:4px 0 0;">${booking.guests || "-"} άτομα ${booking.location ? " | " + booking.location : ""}</p>
            </div>

            <p style="font-size:14px;color:#64748b;text-align:center;">Αν χρειαστεί να ακυρώσετε ή να αλλάξετε την κράτησή σας, επικοινωνήστε με το κατάστημα στο τηλέφωνο: ${booking.phone || "-"}</p>
          </div>
          <div style="background:#f8fafc;padding:12px;text-align:center;border-radius:0 0 8px 8px;border:1px solid #e2e8f0;border-top:none;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">TableReserve | Υποστηρίζεται από το tablereserve.gr</p>
          </div>
        </div>`
      });
    }

    return res.status(200).json({ success: true, sentTo: notificationEmail, customerNotified: !!booking.email });
  } catch (err) {
    console.error("Email error:", err);
    return res.status(500).json({ error: "Αποτυχια αποστολης email", details: err.message });
  }
});

module.exports = router;
