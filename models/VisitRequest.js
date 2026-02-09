// models/VisitRequest.js
const mongoose = require("mongoose");

const VISIT_STATUSES = ["pending", "accepted", "rejected", "cancelled", "completed"];

const visitRequestSchema = new mongoose.Schema(
  {
    houseId: { type: mongoose.Schema.Types.ObjectId, ref: "House", required: true, index: true },
    landlordId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    status: { type: String, enum: VISIT_STATUSES, default: "pending", index: true },

    requestedSlot: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },

    // When landlord accepts, this becomes the final confirmed slot (can be same as requested)
    finalSlot: {
      start: { type: Date, default: null },
      end: { type: Date, default: null },
    },

    tenantMessage: { type: String, default: "" },
    landlordNote: { type: String, default: "" },

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

visitRequestSchema.pre("save", function () {
  this.statusHistory = this.statusHistory || [];

  if (this.isNew) {
    this.statusHistory.push({
      status: this.status,
      at: new Date(),
      by: null,
      note: "Visit request created",
    });
    return;
  }

  if (this.isModified("status")) {
    this.statusHistory.push({
      status: this.status,
      at: new Date(),
      by: null,
      note: `Status changed to ${this.status}`,
    });
  }
});

module.exports = mongoose.model("VisitRequest", visitRequestSchema);
