const express = require("express");
const authMiddleware = require("../middleware/auth");
const SupportTicket = require("../models/SupportTicket");
const SupportMessage = require("../models/SupportMessage");

const router = express.Router();

// ✅ Define what "active" means (ONLY 1 active allowed)
const ACTIVE_STATUSES = ["open", "in_progress", "waiting_user", "resolved"];

/**
 * POST /api/support/tickets
 * ✅ Only allow creating a ticket if NO active ticket exists.
 */
router.post("/tickets", authMiddleware, async (req, res) => {
  try {
    const {
      subject,
      description,
      category,
      priority,
      attachments = [],
      bookingId = null,
      houseId = null,
    } = req.body;

    if (!subject?.trim() || !description?.trim()) {
      return res.status(400).json({ message: "Subject and description are required" });
    }

    // ✅ BLOCK creating another ticket if an active one exists
    const existing = await SupportTicket.findOne({
      userId: req.user._id,
      status: { $in: ACTIVE_STATUSES },
    }).sort({ lastMessageAt: -1 });

    if (existing) {
      return res.status(409).json({
        message: "You already have an active support ticket. Please use the existing one.",
        activeTicketId: existing._id,
      });
    }

    const ticket = await SupportTicket.create({
      userId: req.user._id,
      subject: subject.trim(),
      description: description.trim(),
      category: category || "other",
      priority: priority || "medium",
      attachments,
      bookingId,
      houseId,
      lastMessageAt: new Date(),
    });

    // Create first message (so thread always has messages)
    await SupportMessage.create({
      ticketId: ticket._id,
      senderRole: "user",
      senderId: req.user._id,
      message: description.trim(),
      attachments,
    });

    res.json({ success: true, ticketId: ticket._id, message: "Ticket created" });
  } catch (err) {
    console.error("Create support ticket error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/support/tickets
 * ✅ Tenant/Landlord should NOT see closed tickets.
 */
router.get("/tickets", authMiddleware, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({
      userId: req.user._id,
      status: { $ne: "closed" }, // ✅ hide closed tickets from user side
    }).sort({ lastMessageAt: -1, createdAt: -1 });

    res.json({ success: true, tickets });
  } catch (err) {
    console.error("Get my tickets error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/support/tickets/:id
 * ✅ If ticket is closed, behave like it doesn't exist for user.
 */
router.get("/tickets/:id", authMiddleware, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      userId: req.user._id,
      status: { $ne: "closed" }, // ✅ hide closed ticket detail too
    });

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const messages = await SupportMessage.find({ ticketId: ticket._id }).sort({ createdAt: 1 });

    res.json({ success: true, ticket, messages });
  } catch (err) {
    console.error("Get ticket detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/support/tickets/:id/messages
 * ✅ Prevent user from sending message to closed ticket.
 */
router.post("/tickets/:id/messages", authMiddleware, async (req, res) => {
  try {
    const { message, attachments = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Message is required" });

    const ticket = await SupportTicket.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    // ✅ Block sending if closed
    if (ticket.status === "closed") {
      return res.status(400).json({ message: "This ticket is closed." });
    }

    await SupportMessage.create({
      ticketId: ticket._id,
      senderRole: "user",
      senderId: req.user._id,
      message: message.trim(),
      attachments,
    });

    ticket.lastMessageAt = new Date();
    // if admin asked user to respond, switch status back
    if (ticket.status === "waiting_user") ticket.status = "in_progress";
    await ticket.save();

    res.json({ success: true });
  } catch (err) {
    console.error("User send message error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
