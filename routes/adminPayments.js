const express = require("express");
const Booking = require("../models/Booking");
const User = require("../models/User");
const requireAdmin = require("../middleware/requireAdmin");
const { sendBookingTenantEmail, sendBookingLandlordEmail } = require("../utils/sendEmail"); 
// ^ use your SendGrid Web API version and add new functions later if needed

const router = express.Router();

/**
 * GET /api/admin/bookings?status=paid
 * Lists bookings for admin dashboard
 */
router.get("/bookings", requireAdmin, async (req, res) => {
  const { status } = req.query;

  const filter = {};
  if (status) filter.status = status;

  const bookings = await Booking.find(filter)
    .sort({ createdAt: -1 })
    .populate("tenantId", "name email phone")
    .populate("landlordId", "name email phone upiId")
    .populate("houseId", "title location");

  res.json({ bookings });
});

/**
 * POST /api/admin/bookings/:id/approve
 * Moves: paid -> approved
 */
router.post("/bookings/:id/approve", requireAdmin, async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });

  if (booking.status !== "paid") {
    return res.status(400).json({ message: `Only 'paid' bookings can be approved. Current: ${booking.status}` });
  }

  booking.status = "approved";
  booking.approvedAt = new Date();
  await booking.save();

  res.json({ message: "Booking approved", booking });
});

/**
 * POST /api/admin/bookings/:id/mark-transferred
 * Moves: approved -> transferred
 * Body: { payoutTxnId: "UTR123..." }
 */
router.post("/bookings/:id/mark-transferred", requireAdmin, async (req, res) => {
  const { payoutTxnId } = req.body;

  if (!payoutTxnId || payoutTxnId.trim().length < 6) {
    return res.status(400).json({ message: "payoutTxnId (UTR/Txn ID) is required" });
  }

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: "Booking not found" });

  if (booking.status !== "approved") {
    return res.status(400).json({ message: `Only 'approved' bookings can be marked transferred. Current: ${booking.status}` });
  }

  booking.status = "transferred";
  booking.transferredAt = new Date();
  booking.payoutTxnId = payoutTxnId.trim();
  await booking.save();

  // Send emails (you can create new email templates, but here's the idea)
  try {
    const full = await Booking.findById(booking._id)
      .populate("tenantId", "name email phone")
      .populate("landlordId", "name email phone upiId")
      .populate("houseId", "title location");

    // If you want dedicated emails for payout, I’ll add functions.
    // For now, you can reuse booking emails or create new ones.
    // Example: send simple confirmation by reusing your existing templates is not ideal.
  } catch (e) {
    console.error("Email sending skipped/failed:", e.message);
  }

  res.json({ message: "Marked as transferred", booking });
});

/**
 * GET /api/admin/bookings/:id/upi-intent
 * Returns a UPI deep-link for admin to click and pay landlord
 */
router.get("/bookings/:id/upi-intent", requireAdmin, async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate("landlordId", "name upiId")
    .populate("tenantId", "name")
    .populate("houseId", "title");

  if (!booking) return res.status(404).json({ message: "Booking not found" });

  const upiId = booking.landlordId?.upiId;
  if (!upiId) return res.status(400).json({ message: "Landlord UPI ID not set" });

  const pa = encodeURIComponent(upiId);
  const pn = encodeURIComponent(booking.landlordId?.name || "Landlord");
  const am = encodeURIComponent(String(booking.amount));
  const tn = encodeURIComponent(`HomeRent payout | Booking ${booking._id}`);

  const intent = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;

  res.json({ intent });
});

module.exports = router;
