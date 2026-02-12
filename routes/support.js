const express = require("express");
const authMiddleware = require("../middleware/auth");
const SupportTicket = require("../models/SupportTicket");
const SupportMessage = require("../models/SupportMessage");

const router = express.Router();

/**
 * POST /api/support/tickets
 */
router.post("/tickets", authMiddleware, async (req, res) => {
  try {
    const { subject, description, category, priority, attachments = [], bookingId = null, houseId = null } = req.body;

    if (!subject?.trim() || !description?.trim()) {
      return res.status(400).json({ message: "Subject and description are required" });
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

    res.json({ success: true, ticketId: ticket._id });
  } catch (err) {
    console.error("Create support ticket error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/support/tickets
 */
router.get("/tickets", authMiddleware, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ userId: req.user._id })
      .sort({ lastMessageAt: -1, createdAt: -1 });

    res.json({ success: true, tickets });
  } catch (err) {
    console.error("Get my tickets error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/support/tickets/:id
 */
router.get("/tickets/:id", authMiddleware, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user._id });
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
 */
router.post("/tickets/:id/messages", authMiddleware, async (req, res) => {
  try {
    const { message, attachments = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Message is required" });

    const ticket = await SupportTicket.findOne({ _id: req.params.id, userId: req.user._id });
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

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
