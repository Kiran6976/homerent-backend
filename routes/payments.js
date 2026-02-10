// routes/payments.js
const express = require("express");
const router = express.Router();

/**
 * Razorpay disabled (manual payments in use)
 */
router.post("/razorpay/webhook", (req, res) => {
  return res.status(410).json({
    ok: false,
    message: "Razorpay payments are disabled. Manual payment flow is active.",
  });
});

module.exports = router;
