// routes/bookings.js
const express = require("express");
const auth = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const House = require("../models/House");
const User = require("../models/User");
const Booking = require("../models/Booking");

const router = express.Router();

/**
 * Statuses considered "active" and should block parallel bookings
 */
const ACTIVE_STATUSES = ["initiated", "qr_created", "payment_submitted", "paid", "approved", "transferred"];

/**
 * Tenant sees only actually rented houses
 */
const RENT_STATUSES = ["approved", "transferred"];

/**
 * GET /api/bookings/my
 * Tenant sees all their bookings
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
 * GET /api/bookings/my-rents
 * Tenant sees only RENTED houses (approved/transferred)
 */
router.get("/my-rents", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const bookings = await Booking.find({
      tenantId: req.user._id,
      status: { $in: RENT_STATUSES },
    })
      .sort({ createdAt: -1 })
      .populate(
        "houseId",
        "title location rent bookingAmount images type furnished beds baths area status currentTenantId rentedAt"
      )
      .populate("landlordId", "name email phone");

    const houses = bookings.map((b) => b.houseId).filter(Boolean);

    return res.json({ success: true, bookings, houses });
  } catch (err) {
    console.error("my rents error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/bookings/:id/cancel
 * Tenant cancels their booking
 * Body: { note?: string }
 *
 * Rules:
 * - Can cancel until transferred
 * - Cannot cancel already rejected/cancelled/failed/expired
 */
router.put("/:id/cancel", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (String(booking.tenantId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (String(booking.status) === "transferred") {
      return res.status(400).json({ message: "Cannot cancel after transfer" });
    }

    const nonCancellable = ["rejected", "cancelled", "failed", "expired"];
    if (nonCancellable.includes(String(booking.status))) {
      return res.status(400).json({ message: `Cannot cancel booking in status: ${booking.status}` });
    }

    booking.status = "cancelled";
    booking.cancelledAt = new Date();
    booking.cancelNote = String(req.body?.note || "").trim();

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
 * Tenant starts booking -> create Booking + return PLATFORM UPI deep link
 * Body: { houseId }
 */
router.post("/initiate", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const { houseId } = req.body;
    if (!houseId) return res.status(400).json({ message: "houseId is required" });

    const house = await House.findById(houseId);
    if (!house) return res.status(404).json({ message: "House not found" });

    if (house.status === "rented" || house.currentTenantId) {
      return res.status(400).json({ message: "This house is already rented." });
    }

    const amount = Number(house.bookingAmount || 0);
    if (!amount || amount <= 0) return res.status(400).json({ message: "Booking amount not set" });

    const landlord = await User.findById(house.landlordId).select("name email phone role");
    if (!landlord) return res.status(404).json({ message: "Landlord not found" });
    if (landlord.role !== "landlord") return res.status(400).json({ message: "Invalid landlord" });

    // ✅ platform UPI (tenant pays to you)
    const platformUpi = String(process.env.PLATFORM_UPI_ID || "").trim();
    const platformName = String(process.env.PLATFORM_UPI_NAME || "HomeRent").trim();

    console.log("PLATFORM_UPI_ID =", process.env.PLATFORM_UPI_ID);

    if (!platformUpi) {
      return res.status(500).json({ message: "Platform UPI is not configured" });
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
        bookingId: String(existingWithLandlord._id),
        status: existingWithLandlord.status,
        canCancel: true, // ✅ it's their own booking
      });
    }

    // ✅ Prevent multiple tenants booking same house at same time
    const existingForHouse = await Booking.findOne({
      houseId: house._id,
      status: { $in: ACTIVE_STATUSES },
    }).select("_id tenantId status");

    if (existingForHouse) {
      const isMine = String(existingForHouse.tenantId) === String(req.user._id);

      // ✅ If it's same tenant's booking, allow cancel UI
      if (isMine) {
        return res.status(400).json({
          message: "You already have an active booking for this house.",
          bookingId: String(existingForHouse._id),
          status: existingForHouse.status,
          canCancel: true,
        });
      }

      // ✅ If it's another tenant's booking, DO NOT leak bookingId
      return res.status(409).json({
        message: "This house already has an active booking by another tenant.",
        status: existingForHouse.status,
        canCancel: false,
      });
    }

    const booking = await Booking.create({
      houseId: house._id,
      landlordId: landlord._id,
      tenantId: req.user._id,
      amount,
      status: "initiated",
    });

    // ✅ Create platform UPI deep link
    const pa = encodeURIComponent(platformUpi);
    const pn = encodeURIComponent(platformName);
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
        name: platformName,
        upiId: platformUpi,
      },
      landlord: {
        id: String(landlord._id),
        name: landlord.name,
        phone: landlord.phone,
        email: landlord.email,
      },
    });
  } catch (err) {
    console.error("booking initiate error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/bookings/:id/mark-paid
 * Tenant submits manual payment proof (UTR + optional screenshot)
 * Body: { utr: string (required), proofUrl?: string }
 *
 * ✅ Sets status -> payment_submitted
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

    const utr = String(req.body?.utr || "").trim();
    const proofUrl = String(req.body?.proofUrl || "").trim();

    if (!utr) return res.status(400).json({ message: "UTR is required" });

    const allowed = ["initiated", "qr_created", "created"];
    if (!allowed.includes(String(booking.status))) {
      return res.status(400).json({ message: `Cannot submit payment from status: ${booking.status}` });
    }

    const house = await House.findById(booking.houseId).select("status currentTenantId");
    if (house && (house.status === "rented" || house.currentTenantId)) {
      return res.status(400).json({ message: "This house is already rented." });
    }

    booking.status = "payment_submitted";
    booking.tenantUtr = utr;
    booking.paymentProofUrl = proofUrl;
    booking.paymentSubmittedAt = new Date();

    booking.statusHistory = booking.statusHistory || [];
    booking.statusHistory.push({
      status: "payment_submitted",
      at: new Date(),
      by: req.user._id,
      note: `Payment proof submitted. UTR: ${utr}`,
    });

    await booking.save();

    return res.json({
      success: true,
      message: "Payment proof submitted",
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
