const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    houseId: { type: mongoose.Schema.Types.ObjectId, ref: "House", required: true },
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    amount: { type: Number, required: true },

    // ✅ New flow statuses
    status: {
      type: String,
      enum: ["initiated", "qr_created", "paid", "approved", "transferred", "failed", "expired"],
      default: "initiated",
    },

    razorpayQrId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },

    // ❌ remove route transfer id
    // razorpayTransferId: { type: String, default: null },

    qrImageUrl: { type: String, default: null },
    qrShortUrl: { type: String, default: null },

    // ✅ Admin actions tracking
    approvedAt: { type: Date, default: null },
    transferredAt: { type: Date, default: null },

    // ✅ Admin will paste UTR/Txn id after paying via UPI app
    payoutTxnId: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

bookingSchema.index({ houseId: 1, tenantId: 1, status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
