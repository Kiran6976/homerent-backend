const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const Booking = require("../models/Booking");
const User = require("../models/User");
const House = require("../models/House");
const { sendOtpEmail, sendBookingTenantEmail, sendBookingLandlordEmail } = require("../utils/sendEmail");

const router = express.Router();

const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

function verifySignature(rawBody, signature, secret) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return expected === signature;
}

router.post("/razorpay/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!signature || !secret) return res.status(400).send("Missing signature/secret");

    if (!verifySignature(req.rawBody, signature, secret)) {
      return res.status(400).send("Invalid signature");
    }

    const payload = JSON.parse(req.rawBody.toString("utf8"));

    if (payload.event !== "qr_code.credited") return res.json({ ok: true });

    const qr = payload?.payload?.qr_code?.entity;
    const payment = payload?.payload?.payment?.entity;

    const bookingId = qr?.notes?.bookingId;
    if (!bookingId) return res.json({ ok: true });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.json({ ok: true });
    if (booking.status === "transferred" || booking.status === "paid") return res.json({ ok: true }); // idempotent

    booking.status = "paid";
    booking.razorpayPaymentId = payment?.id || null;
    await booking.save();

    const landlord = await User.findById(booking.landlordId).select("name email phone razorpayAccountId");
    const tenant = await User.findById(booking.tenantId).select("name email phone");
    const house = await House.findById(booking.houseId).select("title location");

    // Transfer 100% to landlord linked account
    const transferRes = await rzp.payments.transfer(booking.razorpayPaymentId, {
      transfers: [
        {
          account: landlord.razorpayAccountId,
          amount: Math.round(booking.amount * 100),
          currency: "INR",
          notes: {
            bookingId: String(booking._id),
            houseId: String(booking.houseId),
          },
        },
      ],
    });

    // transferRes.items[0].id usually contains transfer id
    const transferId = transferRes?.items?.[0]?.id || null;
    booking.status = "transferred";
    booking.razorpayTransferId = transferId;
    await booking.save();

    // Emails (we’ll add these functions next)
    if (tenant?.email) await sendBookingTenantEmail(tenant, booking, house);
    if (landlord?.email) await sendBookingLandlordEmail(landlord, tenant, booking, house);

    return res.json({ ok: true });
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(500).send("Server error");
  }
});

module.exports = router;
