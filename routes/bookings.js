// routes/bookings.js (FULL UPDATED FILE)
const express = require("express");
const auth = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const House = require("../models/House");
const User = require("../models/User");
const Booking = require("../models/Booking");

const router = express.Router();

/**
 * Helper: statuses that count as "active" for locking house/landlord
 * - These statuses mean: tenant has started/paid/processing, so we block another booking.
 */
const ACTIVE_STATUSES = ["initiated", "qr_created", "paid", "approved", "transferred"];

/**
 * GET /api/bookings/my
 * Tenant sees their bookings (so "invisible" booking becomes visible)
 */
router.get("/my", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const bookings = await Booking.find({ tenantId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("houseId", "title location rent bookingAmount status currentTenantId")
      .populate("landlordId", "name email phone");

    return res.json({ success: true, bookings });
  } catch (err) {
    console.error("my bookings error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/bookings/:id/cancel
 * Tenant cancels their booking (fixes "invisible active booking" problem)
 * Body: { note?: string }
 *
 * ✅ IMPORTANT RULE:
 * - Tenant CAN cancel even if status is "approved"
 * - Tenant CANNOT cancel once status is "transferred"
 */
router.put("/:id/cancel", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Only tenant who created it can cancel
    if (String(booking.tenantId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // ❌ Cannot cancel after final transfer
    if (String(booking.status) === "transferred") {
      return res.status(400).json({ message: "Cannot cancel after transfer" });
    }

    // ❌ Cannot cancel if already rejected/cancelled/failed/expired
    // (approved is cancellable now ✅)
    const nonCancellable = ["rejected", "cancelled", "failed", "expired"];
    if (nonCancellable.includes(String(booking.status))) {
      return res.status(400).json({ message: `Cannot cancel booking in status: ${booking.status}` });
    }

    // ✅ Mark cancelled
    booking.status = "cancelled";

    // Optional fields (add in Booking schema if you want; otherwise ignored if strict)
    booking.cancelledAt = new Date();
    booking.cancelNote = String(req.body?.note || "").trim();

    // Optional: status history
    booking.statusHistory = booking.statusHistory || [];
    booking.statusHistory.push({
      status: "cancelled",
      at: new Date(),
      by: req.user._id,
      note: booking.cancelNote || "Cancelled by tenant",
    });

    await booking.save();

    return res.json({
      success: true,
      message: "Booking cancelled",
      bookingId: String(booking._id),
      status: booking.status,
    });
  } catch (err) {
    console.error("cancel booking error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/bookings/initiate
 * Tenant starts booking -> create a Booking + return UPI deep link
 * Body: { houseId }
 */
router.post("/initiate", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const { houseId } = req.body;
    if (!houseId) return res.status(400).json({ message: "houseId is required" });

    const house = await House.findById(houseId);
    if (!house) return res.status(404).json({ message: "House not found" });

    // ✅ House availability checks (if you added these fields in House model)
    if (house.status === "rented" || house.currentTenantId) {
      return res.status(400).json({ message: "This house is already rented." });
    }

    const amount = Number(house.bookingAmount || 0);
    if (!amount || amount <= 0) return res.status(400).json({ message: "Booking amount not set" });

    const landlord = await User.findById(house.landlordId).select("name email phone upiId role");
    if (!landlord) return res.status(404).json({ message: "Landlord not found" });
    if (landlord.role !== "landlord") return res.status(400).json({ message: "Invalid landlord" });

    if (!landlord.upiId) {
      return res.status(400).json({ message: "Landlord has not set UPI ID yet" });
    }

    // ✅ RULE: 1 tenant can book only 1 house from a landlord at a time
    const existingWithLandlord = await Booking.findOne({
      landlordId: landlord._id,
      tenantId: req.user._id,
      status: { $in: ACTIVE_STATUSES },
    });

    if (existingWithLandlord) {
      return res.status(400).json({
        message: "You already have an active booking with this landlord. One house per landlord allowed.",
        bookingId: String(existingWithLandlord._id), // ✅ IMPORTANT for frontend "Cancel" button
        status: existingWithLandlord.status,
      });
    }

    // ✅ Prevent multiple tenants booking same house at same time
    const existingForHouse = await Booking.findOne({
      houseId: house._id,
      status: { $in: ACTIVE_STATUSES },
    });

    if (existingForHouse) {
      return res.status(400).json({
        message: "This house already has an active booking.",
        bookingId: String(existingForHouse._id),
        status: existingForHouse.status,
      });
    }

    // Create booking
    const booking = await Booking.create({
      houseId: house._id,
      landlordId: landlord._id,
      tenantId: req.user._id,
      amount,
      status: "initiated",
    });

    // Create UPI deep link (unique per booking)
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
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/bookings/:id/mark-paid
 * Tenant confirms they paid (manual flow)
 * Body: { utr?: string }
 *
 * Note: This does NOT mark house rented. Admin approves later -> house becomes rented.
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

    // allow mark paid only when initiated/qr_created (and legacy created)
    const allowed = ["initiated", "qr_created", "created"];
    if (!allowed.includes(String(booking.status))) {
      return res.status(400).json({ message: `Cannot mark paid from status: ${booking.status}` });
    }

    // ✅ Optional extra safety: ensure house is not already rented
    const house = await House.findById(booking.houseId).select("status currentTenantId");
    if (house && (house.status === "rented" || house.currentTenantId)) {
      return res.status(400).json({ message: "This house is already rented." });
    }

    booking.status = "paid";

    // Optional fields (add to schema if you want)
    booking.paidAt = new Date();
    if (req.body?.utr) booking.tenantUtr = String(req.body.utr).trim();

    await booking.save();

    return res.json({
      success: true,
      message: "Marked as paid",
      bookingId: String(booking._id),
      status: booking.status,
    });
  } catch (err) {
    console.error("mark paid error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/bookings/:id/status
 * Tenant/Landlord/Admin can view status
 */
router.get("/:id/status", auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const uid = String(req.user._id);
    const isAllowed =
      uid === String(booking.tenantId) ||
      uid === String(booking.landlordId) ||
      req.user.role === "admin";

    if (!isAllowed) return res.status(403).json({ message: "Forbidden" });

    return res.json({ success: true, status: booking.status });
  } catch (err) {
    console.error("booking status error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
