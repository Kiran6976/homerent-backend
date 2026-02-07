const express = require("express");
const authMiddleware = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const User = require("../models/User");

const router = express.Router();

/**
 * PUT /api/users/me/upi
 * Landlord sets/updates UPI ID
 * body: { upiId: "name@upi" }
 */
router.put(
  "/me/upi",
  authMiddleware,
  roleMiddleware("landlord"),
  async (req, res) => {
    try {
      const { upiId } = req.body;

      if (!upiId || !String(upiId).trim()) {
        return res.status(400).json({ message: "UPI ID is required" });
      }

      const cleaned = String(upiId).trim();

      // light validation (simple)
      if (!cleaned.includes("@") || cleaned.length < 5) {
        return res.status(400).json({ message: "Enter a valid UPI ID (example: name@upi)" });
      }

      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ message: "User not found" });

      user.upiId = cleaned;
      await user.save();

      return res.json({
        success: true,
        message: "UPI ID saved successfully",
        upiId: user.upiId,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          address: user.address,
          phone: user.phone,
          age: user.age,
          upiId: user.upiId,
        },
      });
    } catch (err) {
      console.error("Save UPI error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
