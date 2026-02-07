// models/Booking.js
const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    houseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "House",
      required: true,
    },
    landlordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // ✅ IMPORTANT: include every status you may ever save
    status: {
      type: String,
      enum: [
        "created",       // (some code/models use this as default)
        "initiated",     // when booking doc created
        "qr_created",    // QR created successfully
        "paid",          // Razorpay says payment success but transfer pending
        "transferred",   // payout completed / confirmed
        "failed",        // payment failed
        "expired",       // QR expired
        "cancelled",     // optional
      ],
      default: "initiated",
      index: true,
    },

    // Razorpay QR related
    razorpayQrId: { type: String, default: null },
    qrImageUrl: { type: String, default: null },
    qrShortUrl: { type: String, default: null },

    // optional: store webhook ids, txn ids, etc.
    razorpayPaymentId: { type: String, default: null },
    razorpayTransferId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
