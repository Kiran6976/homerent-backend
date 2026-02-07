const express = require("express");
const auth = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const House = require("../models/House");
const User = require("../models/User");
const Booking = require("../models/Booking");

const router = express.Router();

/**
 * POST /api/bookings/initiate
 * Tenant starts booking -> we create a Booking + return UPI link (NO Razorpay)
 * Body: { houseId }
 */
router.post("/initiate", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const { houseId } = req.body;
    if (!houseId) return res.status(400).json({ message: "houseId is required" });

    const house = await House.findById(houseId);
    if (!house) return res.status(404).json({ message: "House not found" });

    const amount = Number(house.bookingAmount || 0);
    if (!amount || amount <= 0) return res.status(400).json({ message: "Booking amount not set" });

    const landlord = await User.findById(house.landlordId).select("name email phone upiId");
    if (!landlord) return res.status(404).json({ message: "Landlord not found" });

    if (!landlord.upiId) {
      return res.status(400).json({ message: "Landlord has not set UPI ID yet" });
    }

    // Create booking
    const booking = await Booking.create({
      houseId,
      landlordId: landlord._id,
      tenantId: req.user._id,
      amount,
      status: "created", // tenant initiated (not paid yet)
    });

    // Create UPI deep link
    const pa = encodeURIComponent(landlord.upiId);
    const pn = encodeURIComponent(landlord.name || "Landlord");
    const am = encodeURIComponent(String(amount));
    const tn = encodeURIComponent(`HomeRent Booking | ${booking._id}`);

    const upiLink = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;

    return res.json({
      success: true,
      bookingId: String(booking._id),
      amount,
      currency: "INR",
      upiLink,
      payee: {
        name: landlord.name,
        upiId: landlord.upiId,
      },
    });
  } catch (err) {
    console.error("booking initiate error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/bookings/:id/mark-paid
 * Tenant confirms they paid (manual flow)
 * Body: { utr?: string }
 */
router.post("/:id/mark-paid", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (String(booking.tenantId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (booking.status === "transferred") {
      return res.status(400).json({ message: "Already transferred" });
    }

    // allow mark paid only when created/qr_created/initiated etc.
    const allowed = ["created", "initiated", "qr_created"];
    if (!allowed.includes(String(booking.status))) {
      return res.status(400).json({ message: `Cannot mark paid from status: ${booking.status}` });
    }

    booking.status = "paid";
    booking.paidAt = new Date();

    // Optional: store UTR if your Booking schema supports it.
    // If schema doesn't have this field, mongoose will ignore it (strict mode).
    if (req.body?.utr) booking.tenantUtr = String(req.body.utr).trim();

    await booking.save();

    return res.json({ success: true, message: "Marked as paid", bookingId: String(booking._id) });
  } catch (err) {
    console.error("mark paid error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/bookings/:id/status
 */
router.get("/:id/status", auth, async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });

  const uid = String(req.user._id);
  if (
    uid !== String(booking.tenantId) &&
    uid !== String(booking.landlordId) &&
    req.user.role !== "admin"
  ) {
    return res.status(403).json({ message: "Forbidden" });
  }

  res.json({ success: true, status: booking.status });
});

module.exports = router;
