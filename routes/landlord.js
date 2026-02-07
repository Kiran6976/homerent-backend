// routes/landlord.js (FULL UPDATED FILE)
const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");

const router = express.Router();

/**
 * PUT /api/landlord/upi
 * Landlord updates their UPI ID
 * ✅ Also returns updated user so frontend can update profile and redirect
 */
router.put("/upi", authMiddleware, roleMiddleware("landlord"), async (req, res) => {
  try {
    const { upiId } = req.body;

    if (!upiId || !String(upiId).trim()) {
      return res.status(400).json({ message: "UPI ID is required" });
    }

    const cleaned = String(upiId).trim();

    // Simple validation: must contain "@"
    if (!cleaned.includes("@")) {
      return res.status(400).json({ message: "Invalid UPI ID format (example: name@bank)" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.upiId = cleaned;
    await user.save();

    // ✅ send updated user object back (so frontend can store in localStorage)
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
 * ✅ OPTIONAL: Clear UPI ID (if you want)
 * DELETE /api/landlord/upi
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

module.exports = router;
