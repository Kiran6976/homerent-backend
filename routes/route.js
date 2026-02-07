const express = require("express");
const Razorpay = require("razorpay");
const auth = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const User = require("../models/User");

const router = express.Router();

const rzp = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// POST /api/route/landlord/create-linked-account
router.post(
  "/landlord/create-linked-account",
  auth,
  roleMiddleware("landlord"),
  async (req, res) => {
    try {
      const landlord = await User.findById(req.user._id);
      if (!landlord) return res.status(404).json({ message: "User not found" });

      if (landlord.razorpayAccountId) {
        return res.json({
          success: true,
          message: "Linked account already created",
          razorpayAccountId: landlord.razorpayAccountId,
          razorpayAccountStatus: landlord.razorpayAccountStatus,
        });
      }

      // Minimal onboarding payload (you'll expand with bank/KYC fields in next step)
      // Route Linked Account API: POST /v2/accounts
      const account = await rzp.accounts.create({
        type: "route",
        email: landlord.email,
        phone: landlord.phone || "9000090000", // better: require phone on landlord
        legal_business_name: landlord.name,
        business_type: "individual",
        profile: {
          category: "housing", // choose closest that Razorpay accepts in your account config
          subcategory: "rental",
          addresses: {
            registered: {
              street1: landlord.address || "NA",
              city: "NA",
              state: "NA",
              postal_code: "799001",
              country: "IN",
            },
          },
        },
      });

      landlord.razorpayAccountId = account.id;
      landlord.razorpayAccountStatus = "created";
      landlord.razorpayRequirements = account.requirements || {};
      await landlord.save();

      return res.json({
        success: true,
        razorpayAccountId: landlord.razorpayAccountId,
        razorpayAccountStatus: landlord.razorpayAccountStatus,
        requirements: landlord.razorpayRequirements,
      });
    } catch (err) {
      console.error("create linked account error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

module.exports = router;
