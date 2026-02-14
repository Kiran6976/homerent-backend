const mongoose = require("mongoose");

const houseSchema = new mongoose.Schema(
  {
    landlordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
    },

    description: {
      type: String,
      required: [true, "Description is required"],
    },

    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },

    // ✅ Use rent (INR) instead of "price"
    rent: {
      type: Number,
      required: [true, "Rent is required"],
      min: [0, "Rent must be positive"],
    },

    deposit: {
      type: Number,
      required: [true, "Deposit is required"],
      min: [0, "Deposit must be positive"],
    },

    // ✅ booking amount set by landlord (INR)
    bookingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    type: {
      type: String,
      enum: ["apartment", "room", "house"],
      required: true,
    },

    beds: {
      type: Number,
      required: true,
      min: 1,
    },

    baths: {
      type: Number,
      required: true,
      min: 1,
    },

    area: {
      type: Number,
      required: [true, "Area is required"],
      min: [1, "Area must be positive"],
    },

    furnished: {
      type: String,
      enum: ["unfurnished", "semi", "fully"],
      default: "unfurnished",
    },

    amenities: [{ type: String }],
    images: [{ type: String }],
      // ✅ Electricity bill proof (PDF/JPG/PNG)
  electricityBillUrl: { type: String, default: "" },
  electricityBillType: { type: String, default: "" }, // e.g. application/pdf, image/png

  // ✅ Admin verification for listing
  verificationStatus: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
    index: true,
  },
  verifiedAt: { type: Date, default: null },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  rejectReason: { type: String, default: "" },


    availability: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["available", "rented"],
      default: "available",
      index: true,
    },

    currentTenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    currentBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },

    rentedAt: { type: Date, default: null },

  },
  { timestamps: true }
);

// ✅ Index for text search
houseSchema.index({ location: "text", title: "text", description: "text" });

module.exports = mongoose.model("House", houseSchema);
