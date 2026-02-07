const express = require("express");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");

const router = express.Router();

/**
 * PUT /api/landlord/upi
 * Landlord updates their UPI ID
 */
router.put("/upi", authMiddleware, roleMiddleware("landlord"), async (req, res) => {
  try {
    const { upiId } = req.body;

    if (!upiId || !String(upiId).trim()) {
      return res.status(400).json({ message: "UPI ID is required" });
    }

    // Simple validation: must contain "@"
    if (!String(upiId).includes("@")) {
      return res.status(400).json({ message: "Invalid UPI ID format (example: name@bank)" });
    }

    const user = await User.findById(req.user._id);
    user.upiId = String(upiId).trim();
    await user.save();

    res.json({ success: true, message: "UPI ID saved successfully", upiId: user.upiId });
  } catch (err) {
    console.error("Landlord UPI save error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
