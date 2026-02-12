// routes/bookings.js
const express = require("express");
const auth = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const House = require("../models/House");
const User = require("../models/User");
const Booking = require("../models/Booking");

const router = express.Router();

/**
 * ✅ Tenant-level "active" statuses (rules like:
 * - 1 tenant can book only 1 house from a landlord at a time
 * - cancel eligibility etc.
 *
 * We keep initiated/qr_created here so the SAME tenant can't spam bookings.
 */
const TENANT_ACTIVE_STATUSES = [
  "initiated",
  "qr_created",
  "payment_submitted",
  "paid",
  "approved",
  "transferred",
];

/**
 * ✅ House-level blocking statuses (USED FOR UI availability)
 * IMPORTANT:
 * - initiated/qr_created should NOT block others
 * - only payment_submitted+ blocks
 */
const HOUSE_BLOCK_STATUSES = ["payment_submitted", "paid", "approved", "transferred"];

/**
 * Tenant sees only actually rented houses
 */
const RENT_STATUSES = ["approved", "transferred"];

/**
 * ⏱️ Booking hold time:
 * initiated/qr_created is valid ONLY for 10 minutes.
 * After that, it auto-expires and won't block / won't count as active.
 */
const HOLD_MINUTES = 10;
const HOLD_MS = HOLD_MINUTES * 60 * 1000;

const isHoldStatus = (status) => ["initiated", "qr_created"].includes(String(status || ""));
const isHoldExpired = (booking) => {
  if (!booking?.createdAt) return false;
  if (!isHoldStatus(booking.status)) return false;
  return Date.now() - new Date(booking.createdAt).getTime() > HOLD_MS;
};

const expireBookingIfNeeded = async (booking) => {
  if (!booking) return false;
  if (!isHoldExpired(booking)) return false;

  booking.status = "expired";
  booking.statusHistory = booking.statusHistory || [];
  booking.statusHistory.push({
    status: "expired",
    at: new Date(),
    by: null,
    note: `Auto-expired (no payment proof) after ${HOLD_MINUTES} minutes`,
  });

  await booking.save();
  return true;
};

const expireHoldsForHouse = async (houseId) => {
  const holds = await Booking.find({
    houseId,
    status: { $in: ["initiated", "qr_created"] },
  }).select("_id status createdAt statusHistory");
  for (const b of holds) {
    if (isHoldExpired(b)) await expireBookingIfNeeded(b);
  }
};

/**
 * ✅ PUBLIC: Check house booking availability for details page
 * GET /api/bookings/house/:houseId/availability
 *
 * available=true  -> show "Book Now"
 * available=false -> show disabled "Already booked / rented"
 */
router.get("/house/:houseId/availability", async (req, res) => {
  try {
    const { houseId } = req.params;
    if (!houseId) return res.status(400).json({ message: "houseId is required" });

    const house = await House.findById(houseId).select("status currentTenantId");
    if (!house) return res.status(404).json({ message: "House not found" });

    // already rented in house model
    if (house.status === "rented" || house.currentTenantId) {
      return res.json({ success: true, available: false, reason: "rented", status: "rented" });
    }

    // ✅ housekeeping: expire old holds (initiated/qr_created)
    await expireHoldsForHouse(houseId);

    // ✅ Only payment_submitted+ blocks others
    const latestBlocking = await Booking.findOne({
      houseId,
      status: { $in: HOUSE_BLOCK_STATUSES },
    })
      .sort({ createdAt: -1 })
      .select("status createdAt");

    if (!latestBlocking) return res.json({ success: true, available: true, reason: "" });

    return res.json({
      success: true,
      available: false,
      reason: "active_booking",
      status: latestBlocking.status,
    });
  } catch (err) {
    console.error("availability error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

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

    const platformUpi = String(process.env.PLATFORM_UPI_ID || "").trim();
    const platformName = String(process.env.PLATFORM_UPI_NAME || "HomeRent").trim();
    if (!platformUpi) return res.status(500).json({ message: "Platform UPI is not configured" });

    // ✅ housekeeping: expire old holds for this house
    await expireHoldsForHouse(String(house._id));

    /**
     * ✅ RULE: 1 tenant can book only 1 house from a landlord at a time
     * - but initiated/qr_created only counts for 10 minutes
     */
    let existingWithLandlord = await Booking.findOne({
      landlordId: landlord._id,
      tenantId: req.user._id,
      status: { $in: TENANT_ACTIVE_STATUSES },
    }).sort({ createdAt: -1 });

    if (existingWithLandlord && isHoldExpired(existingWithLandlord)) {
      await expireBookingIfNeeded(existingWithLandlord);
      existingWithLandlord = null;
    }

    if (existingWithLandlord) {
      return res.status(400).json({
        message: "You already have an active booking with this landlord. Complete payment proof or wait 10 minutes.",
        bookingId: String(existingWithLandlord._id),
        status: existingWithLandlord.status,
        canCancel: true,
      });
    }

    /**
     * ✅ HOUSE BLOCK:
     * Only payment_submitted+ blocks other tenants.
     */
    const existingBlockingForHouse = await Booking.findOne({
      houseId: house._id,
      status: { $in: HOUSE_BLOCK_STATUSES },
    })
      .sort({ createdAt: -1 })
      .select("_id tenantId status createdAt");

    if (existingBlockingForHouse) {
      const isMine = String(existingBlockingForHouse.tenantId) === String(req.user._id);

      if (isMine) {
        return res.status(400).json({
          message: "You already have an active booking for this house.",
          bookingId: String(existingBlockingForHouse._id),
          status: existingBlockingForHouse.status,
          canCancel: true,
        });
      }

      return res.status(409).json({
        message: "This house already has an active booking by another tenant.",
        status: existingBlockingForHouse.status,
        canCancel: false,
      });
    }

    // ✅ Create booking as initiated (valid 10 mins)
    const booking = await Booking.create({
      houseId: house._id,
      landlordId: landlord._id,
      tenantId: req.user._id,
      amount,
      status: "initiated",
    });

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
      payee: { name: platformName, upiId: platformUpi },
      landlord: {
        id: String(landlord._id),
        name: landlord.name,
        phone: landlord.phone,
        email: landlord.email,
      },
      holdMinutes: HOLD_MINUTES,
    });
  } catch (err) {
    console.error("booking initiate error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/bookings/:id/mark-paid
 * Tenant submits manual payment proof (UTR + optional screenshot)
 * ✅ This blocks house now (status = payment_submitted)
 */
router.post("/:id/mark-paid", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // auto-expire if hold expired before proof
    if (isHoldExpired(booking)) {
      await expireBookingIfNeeded(booking);
      return res.status(400).json({ message: "Booking expired. Please book again." });
    }

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
      uid === String(booking.tenantId) || uid === String(booking.landlordId) || req.user.role === "admin";

    if (!isAllowed) return res.status(403).json({ message: "Forbidden" });

    // if hold expired, auto-expire it and return status
    if (isHoldExpired(booking)) {
      await expireBookingIfNeeded(booking);
      return res.json({ success: true, status: "expired" });
    }

    return res.json({ success: true, status: booking.status });
  } catch (err) {
    console.error("booking status error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
