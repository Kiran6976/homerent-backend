const express = require("express");
const authMiddleware = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const SupportTicket = require("../models/SupportTicket");
const SupportMessage = require("../models/SupportMessage");

const router = express.Router();

/**
 * GET /api/admin/support/tickets?status=open
 */
router.get("/tickets", authMiddleware, roleMiddleware("admin"), async (req, res) => {
  try {
    const { status, category, priority } = req.query;

    const query = {};
    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;

    const tickets = await SupportTicket.find(query)
      .sort({ lastMessageAt: -1 })
      .populate("userId", "name email phone role");

    res.json({ success: true, tickets });
  } catch (err) {
    console.error("Admin list tickets error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/admin/support/tickets/:id
 */
router.get("/tickets/:id", authMiddleware, roleMiddleware("admin"), async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).populate("userId", "name email phone role");
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    const messages = await SupportMessage.find({ ticketId: ticket._id }).sort({ createdAt: 1 });

    res.json({ success: true, ticket, messages });
  } catch (err) {
    console.error("Admin ticket detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/support/tickets/:id/reply
 */
router.post("/tickets/:id/reply", authMiddleware, roleMiddleware("admin"), async (req, res) => {
  try {
    const { message, attachments = [], setStatus } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: "Message is required" });

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    await SupportMessage.create({
      ticketId: ticket._id,
      senderRole: "admin",
      senderId: req.user._id,
      message: message.trim(),
      attachments,
    });

    ticket.lastMessageAt = new Date();
    // Default behavior: admin replied -> waiting_user (unless admin sets something else)
    ticket.status = setStatus || "waiting_user";
    await ticket.save();

    res.json({ success: true });
  } catch (err) {
    console.error("Admin reply error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /api/admin/support/tickets/:id
 * body: { status, priority, category }
 */
router.patch("/tickets/:id", authMiddleware, roleMiddleware("admin"), async (req, res) => {
  try {
    const { status, priority, category } = req.body;

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });

    if (status) ticket.status = status;
    if (priority) ticket.priority = priority;
    if (category) ticket.category = category;

    await ticket.save();
    res.json({ success: true, ticket });
  } catch (err) {
    console.error("Admin update ticket error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
