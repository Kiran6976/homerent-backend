const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    houseId: { type: mongoose.Schema.Types.ObjectId, ref: "House", required: true },
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    amount: { type: Number, required: true }, // INR
    status: {
      type: String,
      enum: ["initiated", "qr_created", "paid", "transferred", "failed", "expired"],
      default: "initiated",
    },

    razorpayQrId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },
    razorpayTransferId: { type: String, default: null },

    qrImageUrl: { type: String, default: null },
    qrShortUrl: { type: String, default: null },
  },
  { timestamps: true }
);

bookingSchema.index({ houseId: 1, tenantId: 1, status: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
