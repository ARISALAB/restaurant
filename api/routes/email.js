const express = require("express");
const router = express.Router();
const { Resend } = require("resend");
const { getDb } = require("../firebase");

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /v3/email/notify
 * Στέλνει email ειδοποίησης για νέα κράτηση
 * Body: { shopId, bookingId }
 */
router.post("/notify", async (req, res) => {
  try {
    const { shopId, bookingId } = req.body;

    if (!shopId || !bookingId) {
      return res.status(400).json({ error: "shopId και bookingId απαιτούνται" });
    }

    const db = getDb();

    const bookingSnap = await db.ref(`reservations/${shopId}/${bookingId}`).get();
    if (!bookingSnap.exists()) {
      return res.status(200).json({ message: "Κράτηση δεν βρέθηκε" });
    }
    const booking = bookingSnap.val();

    const emailSnap = await db.ref(`shop_profile/${shopId}/info/notificationEmail`).get();
    if (!emailSnap.exists() || !emailSnap.val()) {
      return res.status(200).json({ message: "Δεν υπάρχει notification email" });
    }
    const notificationEmail = emailSnap.val();

    const shopName = shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, " ");
    const sourceLabel = booking.source === "google" ? "Google" : "TableReserve";
    const statusLabel = booking.status === "confirmed" ? "Επιβεβαιωμένη" : booking.status === "pending" ? "Εκκρεμής" : booking.status;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    <div style="background:#2c3e50;padding:24px;text-align:center;">
      <h1 style="color:#fff;margin:0;font-size:22px;">Νέα Κράτηση - ${shopName}</h1>
    </div>
    <div style="padding:24px;">
      <p style="color:#333;font-size:15px;">Λάβατε μια νέα κράτηση μέσω <strong>${sourceLabel}</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <tr style="background:#f8f9fa;">
          <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;color:#495057;">Κατάσταση</td>
          <td style="padding:10px;border:1px solid #dee2e6;color:#333;">${statusLabel}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;color:#495057;">Όνομα</td>
          <td style="padding:10px;border:1px solid #dee2e6;color:#333;">${booking.customerName || "-"}</td>
        </tr>
        <tr style="background:#f8f9fa;">
          <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;color:#495057;">Τηλέφωνο</td>
          <td style="padding:10px;border:1px solid #dee2e6;color:#333;">${booking.customerPhone || "-"}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;color:#495057;">Ημερομηνία</td>
          <td style="padding:10px;border:1px solid #dee2e6;color:#333;">${booking.date || "-"}</td>
        </tr>
        <tr style="background:#f8f9fa;">
          <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;color:#495057;">Ώρα</td>
          <td style="padding:10px;border:1px solid #dee2e6;color:#333;">${booking.time || "-"}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;color:#495057;">Άτομα</td>
          <td style="padding:10px;border:1px solid #dee2e6;color:#333;">${booking.partySize || "-"}</td>
        </tr>
        ${booking.notes ? `
        <tr style="background:#f8f9fa;">
          <td style="padding:10px;border:1px solid #dee2e6;font-weight:bold;color:#495057;">Σημειώσεις</td>
          <td style="padding:10px;border:1px solid #dee2e6;color:#333;">${booking.notes}</td>
        </tr>` : ""}
      </table>
      <div style="margin-top:24px;text-align:center;">
        <a href="https://tablereserve.gr/?shop=${shopId}" style="background:#2c3e50;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:15px;">Δες τις Κρατήσεις</a>
      </div>
    </div>
    <div style="background:#f8f9fa;padding:16px;text-align:center;">
      <p style="color:#999;font-size:12px;margin:0;">TableReserve &bull; noreply@tablereserve.gr</p>
    </div>
  </div>
</body>
</html>`;

    await resend.emails.send({
      from: "TableReserve <noreply@tablereserve.gr>",
      to: notificationEmail,
      subject: `Νέα Κράτηση - ${shopName} | ${booking.date || ""} ${booking.time || ""}`,
      html,
    });

    return res.status(200).json({ message: "Email εστάλη επιτυχώς" });

  } catch (err) {
    console.error("Email error:", err);
    return res.status(500).json({ error: "Αποτυχία αποστολής email", details: err.message });
  }
});

module.exports = router;
