const mongoose = require("mongoose");

const SupportMessageSchema = new mongoose.Schema(
  {
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "SupportTicket", required: true, index: true },
    senderRole: { type: String, enum: ["user", "admin"], required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, // admin/user

    message: { type: String, trim: true, required: true, maxlength: 5000 },

    attachments: [
      {
        url: String,
        type: { type: String, enum: ["image", "video", "file"], default: "image" },
        name: String,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportMessage", SupportMessageSchema);
