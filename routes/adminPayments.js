// routes/adminPayments.js
const express = require("express");
const Booking = require("../models/Booking");
const authMiddleware = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();

/**
 * GET /api/admin/bookings?status=pending|approved|rejected|all
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

    booking.status = "approved";
    booking.adminDecision = {
      approvedBy: req.user._id,
      approvedAt: new Date(),
      note: String(note || "").trim(),
    };

    await booking.save(); // ✅ history auto-added by schema

    res.json({ success: true, message: "Payment approved", booking });
  } catch (err) {
    console.error("Admin approve error:", err);
    res.status(500).json({ message: "Server error" });
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

    await booking.save(); // ✅ history auto-added

    res.json({ success: true, message: "Payment rejected", booking });
  } catch (err) {
    console.error("Admin reject error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
