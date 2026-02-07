const mongoose = require("mongoose");

const ALLOWED_STATUSES = [
  "initiated",
  "qr_created",
  "paid",
  "approved",
  "rejected",
  "transferred",
  "failed",
  "expired",
  "cancelled",
];

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

    // ✅ Allowed statuses
    status: {
      type: String,
      enum: ALLOWED_STATUSES,
      default: "initiated",
      index: true,
    },

    // Razorpay QR booking
    razorpayQrId: { type: String, default: null },
    qrImageUrl: { type: String, default: null },
    qrShortUrl: { type: String, default: null },

    // Optional payment ids
    razorpayPaymentId: { type: String, default: null },
    razorpayTransferId: { type: String, default: null },

    // ✅ Admin payout tracking (your Admin UI uses UTR)
    payoutTxnId: { type: String, default: null }, // UTR
    payoutAt: { type: Date, default: null },

    // ✅ Admin decision info (for history screen)
    adminDecision: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
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
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        note: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

/**
 * ✅ IMPORTANT NORMALIZER
 * Some old code is setting status = "created"
 * Convert it to "initiated" BEFORE mongoose enum validation runs.
 */
bookingSchema.pre("validate", function (next) {
  if (this.status === "created") {
    this.status = "initiated";
  }
  next();
});

// ✅ Add first history entry, and auto-track status changes
bookingSchema.pre("save", function (next) {
  this.statusHistory = this.statusHistory || [];

  // On create
  if (this.isNew) {
    this.statusHistory.push({
      status: this.status,
      at: new Date(),
      by: null,
      note: "Booking created",
    });
    return next();
  }

  // On update: if status changed, push to history
  if (this.isModified("status")) {
    this.statusHistory.push({
      status: this.status,
      at: new Date(),
      by: null,
      note: "Status updated",
    });
  }

  next();
});

module.exports = mongoose.model("Booking", bookingSchema);
