// routes/adminPayments.js
const express = require("express");
const Booking = require("../models/Booking");
const authMiddleware = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

/**
 * GET /api/admin/bookings?status=pending|approved|rejected|all
 * - pending means: "paid" or "qr_created" (you can tune this)
 * - approved history: "approved" or "transferred"
 */
router.get("/bookings", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const status = String(req.query.status || "pending").toLowerCase();

    let query = {};

    if (status === "pending") {
      // ✅ what admin should verify
      query.status = { $in: ["paid", "qr_created"] };
    } else if (status === "approved") {
      // ✅ history screen: approved (and transferred if you use it later)
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
 * body: { note?: string }
 */
router.put("/bookings/:id/approve", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { note } = req.body || {};

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = "approved";

    booking.adminDecision = booking.adminDecision || {};
    booking.adminDecision.approvedBy = req.user._id;
    booking.adminDecision.approvedAt = new Date();
    booking.adminDecision.note = String(note || "").trim();

    booking.statusHistory = booking.statusHistory || [];
    booking.statusHistory.push({
      status: "approved",
      at: new Date(),
      by: req.user._id,
      note: booking.adminDecision.note || "Approved by admin",
    });

    await booking.save();

    res.json({ success: true, message: "Payment approved", booking });
  } catch (err) {
    console.error("Admin approve error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/admin/bookings/:id/reject
 * body: { note?: string }
 */
router.put("/bookings/:id/reject", authMiddleware, requireAdmin, async (req, res) => {
  try {
    const { note } = req.body || {};

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    booking.status = "rejected";

    booking.adminDecision = booking.adminDecision || {};
    booking.adminDecision.rejectedBy = req.user._id;
    booking.adminDecision.rejectedAt = new Date();
    booking.adminDecision.note = String(note || "").trim();

    booking.statusHistory = booking.statusHistory || [];
    booking.statusHistory.push({
      status: "rejected",
      at: new Date(),
      by: req.user._id,
      note: booking.adminDecision.note || "Rejected by admin",
    });

    await booking.save();

    res.json({ success: true, message: "Payment rejected", booking });
  } catch (err) {
    console.error("Admin reject error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
