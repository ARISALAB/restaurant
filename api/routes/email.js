const express = require("express");
const router  = require("express").Router();
const { Resend } = require("resend");
const { getDb } = require("../firebase");

const resend = new Resend(process.env.RESEND_API_KEY);

router.post("/notify", async (req, res) => {
  try {
    const { shopId, bookingId } = req.body;
    if (!shopId || !bookingId) return res.status(400).json({ error: "shopId και bookingId απαιτούνται" });

    const db = getDb();
    const bookingSnap = await db.ref("reservations/" + shopId + "/" + bookingId).get();
    if (!bookingSnap.exists()) return res.status(200).json({ message: "Κράτηση δεν βρέθηκε" });
    const booking = bookingSnap.val();

    const emailSnap = await db.ref("shop_profile/" + shopId + "/info/notificationEmail").get();
    if (!emailSnap.exists() || !emailSnap.val()) return res.status(200).json({ message: "Δεν υπάρχει notification email" });
    const notificationEmail = emailSnap.val();

    const shopName = shopId.charAt(0).toUpperCase() + shopId.slice(1).replace(/_/g, " ");
    const sourceLabel = booking.source === "google" ? "Google Reserve" : "TableReserve";

    const { data, error } = await resend.emails.send({
      from: "TableReserve <onboarding@resend.dev>",
      to: notificationEmail,
      subject: "Νεα Κρατηση — " + (booking.name||"") + " — " + (booking.date||"" )+ " " + (booking.time||""),
      html: "<div style="font-family:Arial;max-width:600px;margin:0 auto;"><div style="background:#1A3C8F;padding:20px;border-radius:8px 8px 0 0;text-align:center;"><h1 style="color:white;margin:0;">Νεα Κρατηση!</h1><p style="color:#cce0ff;margin:5px 0 0 0;">" + shopName + "</p></div><div style="background:white;padding:24px;border-radius:0 0 8px 8px;"><p><b>Πηγη:</b> " + sourceLabel + "</p><p><b>Ονομα:</b> " + (booking.name||"-") + "</p><p><b>Τηλεφωνο:</b> " + (booking.phone||"-") + "</p><p><b>Email:</b> " + (booking.email||"-") + "</p><p><b>Ημερομηνια:</b> " + (booking.date||"-") + "</p><p><b>Ωρα:</b> " + (booking.time||"-") + "</p><p><b>Ατομα:</b> " + (booking.guests||"-") + "</p><p><b>Θεση:</b> " + (booking.location||"-") + "</p>" + (booking.comments ? "<p><b>Σχολια:</b> " + booking.comments + "</p>" : "") + "<div style="text-align:center;margin-top:20px;"><a href="https://restableres.netlify.app/?shop=" + shopId + "" style="background:#1A3C8F;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">Δες τις Κρατησεις</a></div></div><p style="text-align:center;color:#999;font-size:12px;">TableReserve · restableres.netlify.app</p></div>"
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return res.status(500).json({ error: error.message });
    }

    console.log("[email] Εσταλη σε " + notificationEmail + " για κρατηση " + bookingId + " @ " + shopId);
    res.json({ success: true, sentTo: notificationEmail });

  } catch (err) {
    console.error("[email] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
