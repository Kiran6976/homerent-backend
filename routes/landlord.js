// routes/landlord.js (UPDATED FULL FILE)
const express = require("express");
const User = require("../models/User");
const House = require("../models/House");
const authMiddleware = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");

const router = express.Router();

/**
 * PUT /api/landlord/upi
 * Landlord updates their UPI ID
 * ✅ returns updated user so frontend can update localStorage/profile
 */
router.put("/upi", authMiddleware, roleMiddleware("landlord"), async (req, res) => {
  try {
    const { upiId } = req.body;

    if (!upiId || !String(upiId).trim()) {
      return res.status(400).json({ message: "UPI ID is required" });
    }

    const cleaned = String(upiId).trim();

    // simple validation: must contain "@"
    if (!cleaned.includes("@")) {
      return res.status(400).json({ message: "Invalid UPI ID format (example: name@bank)" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.upiId = cleaned;
    await user.save();

    const updatedUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      address: user.address,
      phone: user.phone,
      age: user.age,
      isVerified: user.isVerified,
      upiId: user.upiId || null,
    };

    return res.json({
      success: true,
      message: "UPI ID saved successfully",
      upiId: user.upiId,
      user: updatedUser,
    });
  } catch (err) {
    console.error("Landlord UPI save error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/landlord/upi
 * Optional: clear UPI ID
 */
router.delete("/upi", authMiddleware, roleMiddleware("landlord"), async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.upiId = null;
    await user.save();

    const updatedUser = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      address: user.address,
      phone: user.phone,
      age: user.age,
      isVerified: user.isVerified,
      upiId: null,
    };

    return res.json({
      success: true,
      message: "UPI ID cleared",
      user: updatedUser,
    });
  } catch (err) {
    console.error("Landlord UPI clear error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ NEW
 * GET /api/landlord/tenants
 * Landlord views which tenant is occupying which house
 * Returns: [{ house..., tenant..., booking... }]
 *
 * Requires House model fields:
 * - status: "available" | "rented"
 * - currentTenantId
 * - currentBookingId
 * - rentedAt
 */
router.get("/tenants", authMiddleware, roleMiddleware("landlord"), async (req, res) => {
  try {
    const houses = await House.find({
      landlordId: req.user._id,
      status: "rented",
      currentTenantId: { $ne: null },
    })
      .sort({ rentedAt: -1 })
      .populate("currentTenantId", "name email phone address")
      .populate("currentBookingId", "amount status createdAt updatedAt payoutTxnId payoutAt");

    const tenants = houses.map((h) => ({
      house: {
        id: String(h._id),
        title: h.title,
        location: h.location,
        rent: h.rent,
        bookingAmount: h.bookingAmount,
        rentedAt: h.rentedAt,
        images: h.images || [],
      },
      tenant: h.currentTenantId
        ? {
            id: String(h.currentTenantId._id),
            name: h.currentTenantId.name,
            email: h.currentTenantId.email,
            phone: h.currentTenantId.phone,
            address: h.currentTenantId.address,
          }
        : null,
      booking: h.currentBookingId
        ? {
            id: String(h.currentBookingId._id),
            amount: h.currentBookingId.amount,
            status: h.currentBookingId.status,
            payoutTxnId: h.currentBookingId.payoutTxnId || null,
            payoutAt: h.currentBookingId.payoutAt || null,
            createdAt: h.currentBookingId.createdAt,
            updatedAt: h.currentBookingId.updatedAt,
          }
        : null,
    }));

    return res.json({ success: true, tenants });
  } catch (err) {
    console.error("Landlord tenants error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ OPTIONAL (recommended)
 * POST /api/landlord/houses/:id/vacate
 * Landlord marks tenant as "left" (makes house available again)
 */
router.post(
  "/houses/:id/vacate",
  authMiddleware,
  roleMiddleware("landlord"),
  async (req, res) => {
    try {
      const house = await House.findOne({
        _id: req.params.id,
        landlordId: req.user._id,
      });

      if (!house) return res.status(404).json({ message: "House not found" });

      // If already available, do nothing
      if (house.status !== "rented" && !house.currentTenantId) {
        return res.json({ success: true, message: "House already available" });
      }

      house.status = "available";
      house.currentTenantId = null;
      house.currentBookingId = null;
      house.rentedAt = null;

      await house.save();

      return res.json({ success: true, message: "House marked as available", houseId: String(house._id) });
    } catch (err) {
      console.error("Vacate error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
