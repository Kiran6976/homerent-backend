// routes/adminPayments.js
const express = require("express");
const Booking = require("../models/Booking");
const House = require("../models/House");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

// ✅ NEW: email helper
const { sendBookingPayoutTransferredEmail } = require("../utils/sendEmail");

const router = express.Router();

/**
 * Helper: mark house as rented for a booking (idempotent)
 */
async function assignHouseToTenant(booking) {
  if (!booking?.houseId) return;

  const house = await House.findById(booking.houseId);
  if (!house) return;

  // If already rented, don't overwrite (safety)
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
 * GET /api/admin/bookings?status=pending|approved|rejected|all|payment_submitted|approved|transferred
 */
router.get("/bookings", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "pending").toLowerCase();
    let query = {};

    if (status === "pending") {
      query.status = { $in: ["payment_submitted"] };
    } else if (status === "approved") {
      // ✅ approved tab should show both approved + transferred
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
 */
router.put("/bookings/:id/approve", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { note } = req.body || {};
    const booking = await Booking.findById(req.params.id);

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status !== "payment_submitted") {
      return res.status(400).json({
        message: `Only payment_submitted bookings can be approved. Current status: ${booking.status}`,
      });
    }

    booking.status = "approved";
    booking.adminDecision = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
      note: String(note || "").trim(),
    };

    pushHistory(booking, "approved", req.user._id, String(note || "Approved by admin"));

    await booking.save();

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
 */
router.put("/bookings/:id/reject", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { note } = req.body || {};
    const booking = await Booking.findById(req.params.id);

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status !== "payment_submitted") {
      return res.status(400).json({
        message: `Only payment_submitted bookings can be rejected. Current status: ${booking.status}`,
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
 * ✅ GET /api/admin/bookings/:id/upi-intent
 * returns UPI intent for landlord payout (admin paying landlord)
 */
router.get("/bookings/:id/upi-intent", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("landlordId", "name upiId")
      .populate("houseId", "title");

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // ✅ IMPORTANT: allow payout intent only after approve
    if (booking.status !== "approved") {
      return res.status(400).json({
        message: `UPI payout is allowed only for APPROVED bookings. Current status: ${booking.status}`,
      });
    }

    const upiId = String(booking?.landlordId?.upiId || "").trim();
    if (!upiId) return res.status(400).json({ message: "Landlord has not set UPI ID" });

    const amount = Number(booking.amount || 0);
    if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid booking amount" });

    const pa = encodeURIComponent(upiId);
    const pn = encodeURIComponent(booking.landlordId?.name || "Landlord");
    const am = encodeURIComponent(String(amount));
    const tn = encodeURIComponent(`HomeRent Payout | ${booking._id}`);

    const intent = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;

    return res.json({
      success: true,
      intent,
      bookingId: String(booking._id),
      amount,
      payee: { name: booking.landlordId?.name || "Landlord", upiId },
      note: `Pay landlord for ${booking?.houseId?.title || "booking"}`,
    });
  } catch (err) {
    console.error("upi-intent error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/bookings/:id/mark-transferred
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

    await assignHouseToTenant(booking);

    const populated = await Booking.findById(booking._id)
      .populate("tenantId", "name email phone")
      .populate("landlordId", "name email phone upiId")
      .populate("houseId", "title location rent bookingAmount");

    // ✅ NEW: send email to landlord (non-blocking)
    try {
      const landlordEmail = populated?.landlordId?.email;
      if (landlordEmail) {
        await sendBookingPayoutTransferredEmail(landlordEmail, {
          landlordName: populated?.landlordId?.name,
          bookingId: String(populated._id),
          houseTitle: populated?.houseId?.title || "",
          houseLocation: populated?.houseId?.location || "",
          amount: populated?.amount,
          payoutUtr: payoutTxnId,
          payoutAt: populated?.payoutAt,
          tenantName: populated?.tenantId?.name || "",
          tenantEmail: populated?.tenantId?.email || "",
        });
      }
    } catch (e) {
      console.error("Booking payout transferred email failed:", e?.message || e);
    }

    return res.json({ success: true, message: "Marked as transferred", booking: populated });
  } catch (err) {
    console.error("mark-transferred error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
