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

    // ✅ include all statuses used by tenant flow + admin panel
    status: {
      type: String,
      enum: [
        "created",
        "initiated",
        "qr_created",
        "paid",

        // ✅ admin-panel manual verification statuses
        "approved",
        "rejected",

        // ✅ final / other states
        "transferred",
        "failed",
        "expired",
        "cancelled",
      ],
      default: "initiated",
      index: true,
    },

    razorpayQrId: { type: String, default: null },
    qrImageUrl: { type: String, default: null },
    qrShortUrl: { type: String, default: null },

    razorpayPaymentId: { type: String, default: null },
    razorpayTransferId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);
