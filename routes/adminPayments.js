// routes/adminPayments.js
const express = require("express");
const Booking = require("../models/Booking");
const House = require("../models/House");
const authMiddleware = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

/**
 * Helper: mark house as rented for a booking (idempotent)
 * - Sets: status=rented, currentTenantId, currentBookingId, rentedAt
 */
async function assignHouseToTenant(booking) {
  if (!booking?.houseId) return;

  const house = await House.findById(booking.houseId);
  if (!house) return;

  // If already rented, don't overwrite tenant/booking (safety)
  if (house.status === "rented" || house.currentTenantId) return;

  house.status = "rented";
  house.currentTenantId = booking.tenantId;
  house.currentBookingId = booking._id;
  house.rentedAt = new Date();

  await house.save();
}

/**
 * Helper: push status history with actor
 */
function pushHistory(booking, status, by, note = "") {
  booking.statusHistory = booking.statusHistory || [];
  booking.statusHistory.push({
    status,
    at: new Date(),
    by: by || null,
    note: String(note || ""),
  });
}

/**
 * GET /api/admin/bookings?status=pending|approved|rejected|all|paid|qr_created|approved|transferred
 */
router.get("/bookings", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "pending").toLowerCase();
    let query = {};

    if (status === "pending") {
      query.status = { $in: ["paid", "qr_created"] };
    } else if (status === "approved") {
      query.status = { $in: ["approved", "transferred"] };
    } else if (status === "rejected") {
      query.status = "rejected";
    } else if (status === "all") {
      query = {};
    } else {
      query.status = status;
    }

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .populate("tenantId", "name email phone")
      .populate("landlordId", "name email phone upiId")
      .populate("houseId", "title location rent bookingAmount");

    res.json({ success: true, bookings });
  } catch (err) {
    console.error("Admin bookings list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/admin/bookings/:id/approve
 * - Only PAID can be approved
 * - After approve: mark house rented + assign tenant
 */
router.put("/bookings/:id/approve", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { note } = req.body || {};
    const booking = await Booking.findById(req.params.id);

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status !== "paid") {
      return res.status(400).json({
        message: `Only PAID bookings can be approved. Current status: ${booking.status}`,
      });
    }

    // ✅ Approve booking
    booking.status = "approved";
    booking.adminDecision = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
      note: String(note || "").trim(),
    };

    // ✅ Explicit history entry with admin id (more accurate than schema auto-note)
    pushHistory(booking, "approved", req.user._id, String(note || "Approved by admin"));

    await booking.save();

    // ✅ Assign house to tenant (auto-hide from global listing)
    await assignHouseToTenant(booking);

    const populated = await Booking.findById(booking._id)
      .populate("tenantId", "name email phone")
      .populate("landlordId", "name email phone upiId")
      .populate("houseId", "title location rent bookingAmount");

    return res.json({ success: true, message: "Payment approved", booking: populated });
  } catch (err) {
    console.error("Admin approve error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/admin/bookings/:id/reject
 * - Only PAID can be rejected
 */
router.put("/bookings/:id/reject", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { note } = req.body || {};
    const booking = await Booking.findById(req.params.id);

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status !== "paid") {
      return res.status(400).json({
        message: `Only PAID bookings can be rejected. Current status: ${booking.status}`,
      });
    }

    booking.status = "rejected";
    booking.adminDecision = {
      rejectedBy: req.user._id,
      rejectedAt: new Date(),
      note: String(note || "").trim(),
    };

    pushHistory(booking, "rejected", req.user._id, String(note || "Rejected by admin"));

    await booking.save();

    const populated = await Booking.findById(booking._id)
      .populate("tenantId", "name email phone")
      .populate("landlordId", "name email phone upiId")
      .populate("houseId", "title location rent bookingAmount");

    return res.json({ success: true, message: "Payment rejected", booking: populated });
  } catch (err) {
    console.error("Admin reject error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/bookings/:id/upi-intent
 * (optional helper) returns UPI intent for landlord payout
 * If you don't need it, remove this.
 */
router.get("/bookings/:id/upi-intent", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate("landlordId", "name upiId");
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const upiId = booking?.landlordId?.upiId;
    if (!upiId) return res.status(400).json({ message: "Landlord has not set UPI ID" });

    const pa = encodeURIComponent(upiId);
    const pn = encodeURIComponent(booking.landlordId.name || "Landlord");
    const am = encodeURIComponent(String(booking.amount));
    const tn = encodeURIComponent(`HomeRent Payout | ${booking._id}`);

    const intent = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;

    return res.json({ success: true, intent });
  } catch (err) {
    console.error("upi-intent error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/bookings/:id/mark-transferred
 * Admin marks payout to landlord as transferred (manual UPI payout)
 * body: { payoutTxnId }
 */
router.post("/bookings/:id/mark-transferred", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const payoutTxnId = String(req.body?.payoutTxnId || "").trim();
    if (!payoutTxnId) return res.status(400).json({ message: "payoutTxnId (UTR) is required" });

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status !== "approved") {
      return res.status(400).json({
        message: `Only APPROVED bookings can be marked transferred. Current status: ${booking.status}`,
      });
    }

    booking.status = "transferred";
    booking.payoutTxnId = payoutTxnId;
    booking.payoutAt = new Date();

    pushHistory(booking, "transferred", req.user._id, `Payout marked transferred. UTR: ${payoutTxnId}`);

    await booking.save();

    // safety: in case approve didn't assign (should already be done)
    await assignHouseToTenant(booking);

    const populated = await Booking.findById(booking._id)
      .populate("tenantId", "name email phone")
      .populate("landlordId", "name email phone upiId")
      .populate("houseId", "title location rent bookingAmount");

    return res.json({ success: true, message: "Marked as transferred", booking: populated });
  } catch (err) {
    console.error("mark-transferred error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
