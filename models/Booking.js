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

    // ✅ all statuses your app may set
    status: {
      type: String,
      enum: [
        "initiated",
        "qr_created",
        "paid",
        "approved",
        "rejected",
        "transferred",
        "failed",
        "expired",
        "cancelled",
      ],
      default: "initiated",
      index: true,
    },

    // Razorpay QR booking
    razorpayQrId: { type: String, default: null },
    qrImageUrl: { type: String, default: null },
    qrShortUrl: { type: String, default: null },

    // Optional if you later store payment/transfer ids
    razorpayPaymentId: { type: String, default: null },
    razorpayTransferId: { type: String, default: null },

    // ✅ Admin decision info (for history screen)
    adminDecision: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // admin user id
      approvedAt: { type: Date, default: null },
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      rejectedAt: { type: Date, default: null },
      note: { type: String, default: "" },
    },

    // ✅ Full audit trail of status changes
    statusHistory: [
      {
        status: { type: String, required: true },
        at: { type: Date, default: Date.now },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // who did it (admin/tenant/system)
        note: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

// ✅ Auto-add first history entry
bookingSchema.pre("save", function (next) {
  if (this.isNew) {
    this.statusHistory = this.statusHistory || [];
    this.statusHistory.push({
      status: this.status,
      at: new Date(),
      by: null,
      note: "Booking created",
    });
  }
  next();
});

module.exports = mongoose.model("Booking", bookingSchema);
