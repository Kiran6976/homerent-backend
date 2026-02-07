const express = require("express");
const Razorpay = require("razorpay");
const auth = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const House = require("../models/House");
const User = require("../models/User");
const Booking = require("../models/Booking");

const router = express.Router();

const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

router.post("/initiate", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const { houseId } = req.body;
    if (!houseId) return res.status(400).json({ message: "houseId is required" });

    const house = await House.findById(houseId);
    if (!house) return res.status(404).json({ message: "House not found" });

    const amount = Number(house.bookingAmount || 0);
    if (!amount || amount <= 0) return res.status(400).json({ message: "Booking amount not set" });

    const landlord = await User.findById(house.landlordId).select("name email phone razorpayAccountId razorpayAccountStatus");
    if (!landlord) return res.status(404).json({ message: "Landlord not found" });

    if (!landlord.razorpayAccountId || landlord.razorpayAccountStatus === "not_created") {
      return res.status(400).json({ message: "Landlord payout setup not completed yet" });
    }

    const booking = await Booking.create({
      houseId,
      landlordId: landlord._id,
      tenantId: req.user._id,
      amount,
      status: "initiated",
    });

    // Create QR (single use, fixed amount)
    const qr = await rzp.qrCode.create({
      type: "upi_qr",
      name: "HomeRent Booking",
      usage: "single_use",
      fixed_amount: true,
      amount: Math.round(amount * 100),
      description: `Booking for ${house.title}`,
      notes: {
        bookingId: String(booking._id),
        houseId: String(house._id),
        landlordId: String(landlord._id),
        tenantId: String(req.user._id),
      },
    });

    booking.status = "qr_created";
    booking.razorpayQrId = qr.id;
    booking.qrImageUrl = qr.image_url || null;
    booking.qrShortUrl = qr.short_url || null;
    await booking.save();

    res.json({
      success: true,
      bookingId: String(booking._id),
      amount: booking.amount,
      qrImageUrl: booking.qrImageUrl,
      qrShortUrl: booking.qrShortUrl,
    });
  } catch (err) {
    console.error("booking initiate error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:id/status", auth, async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });

  const uid = String(req.user._id);
  if (uid !== String(booking.tenantId) && uid !== String(booking.landlordId) && req.user.role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  res.json({ success: true, status: booking.status });
});

module.exports = router;
