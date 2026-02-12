const mongoose = require("mongoose");

const SupportTicketSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    subject: { type: String, trim: true, required: true, maxlength: 120 },
    description: { type: String, trim: true, required: true, maxlength: 5000 },

    category: {
      type: String,
      enum: ["payment", "booking", "house", "account", "visit", "other"],
      default: "other",
      index: true,
    },

    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      index: true,
    },

    status: {
      type: String,
      enum: ["open", "in_progress", "waiting_user", "resolved", "closed"],
      default: "open",
      index: true,
    },

    attachments: [
      {
        url: String,
        type: { type: String, enum: ["image", "video", "file"], default: "image" },
        name: String,
      },
    ],

    // Optional context (nice for debugging payment/booking issues)
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", default: null },
    houseId: { type: mongoose.Schema.Types.ObjectId, ref: "House", default: null },

    lastMessageAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportTicket", SupportTicketSchema);
