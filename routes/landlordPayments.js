// routes/landlordPayments.js
const express = require("express");
const auth = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const Booking = require("../models/Booking");

const router = express.Router();

/**
 * GET /api/landlord/payouts?status=transferred|approved|all
 * Landlord sees their payouts (booking fees transferred)
 */
router.get("/payouts", auth, roleMiddleware("landlord"), async (req, res) => {
  try {
    const status = String(req.query.status || "transferred").toLowerCase();

    const query = { landlordId: req.user._id };

    if (status === "transferred") query.status = "transferred";
    else if (status === "approved") query.status = "approved";
    else if (status === "all") query.status = { $in: ["approved", "transferred", "rejected", "cancelled"] };

    const bookings = await Booking.find(query)
      .sort({ payoutAt: -1, createdAt: -1 })
      .populate("tenantId", "name email phone")
      .populate("houseId", "title location rent bookingAmount")
      .select("amount status payoutTxnId payoutAt tenantId houseId createdAt");

    return res.json({ success: true, bookings });
  } catch (err) {
    console.error("landlord payouts error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
