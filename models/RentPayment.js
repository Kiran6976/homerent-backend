const mongoose = require("mongoose");

const RENT_STATUSES = [
  "initiated",
  "payment_submitted",
  "approved",
  "rejected",
  "cancelled",
];

const rentPaymentSchema = new mongoose.Schema(
  {
    houseId: { type: mongoose.Schema.Types.ObjectId, ref: "House", required: true },
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // YYYY-MM (example: "2026-02")
    period: { type: String, required: true, trim: true },

    amount: { type: Number, required: true, min: 0 },

    status: { type: String, enum: RENT_STATUSES, default: "initiated", index: true },

    tenantUtr: { type: String, trim: true },
    paymentProofUrl: { type: String, trim: true },

    paymentSubmittedAt: Date,
    approvedAt: Date,
    rejectedAt: Date,
    rejectionNote: String,

    statusHistory: [
      {
        status: String,
        at: Date,
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        note: String,
      },
    ],
  },
  { timestamps: true }
);

// ✅ Prevent duplicate record for same month
rentPaymentSchema.index({ houseId: 1, tenantId: 1, period: 1 }, { unique: true });

module.exports = mongoose.model("RentPayment", rentPaymentSchema);
