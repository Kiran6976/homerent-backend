// routes/visits.js
const express = require("express");
const auth = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const VisitRequest = require("../models/VisitRequest");
const House = require("../models/House");

const router = express.Router();

/**
 * Helper: ensure slot is valid and not crazy
 * - supports ISO strings or timestamps
 * - enforces: end > start, 15 mins <= duration <= 4 hrs
 */
function parseSlot(start, end) {
  const s = new Date(start);
  const e = new Date(end);

  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
  if (e <= s) return null;

  const diff = e - s;
  if (diff < 15 * 60 * 1000) return null;
  if (diff > 4 * 60 * 60 * 1000) return null;

  return { start: s, end: e };
}

/**
 * Helper: enforce visit must be in the future (>= X mins)
 */
function isFutureEnough(dateObj, minMinutes = 30) {
  const now = Date.now();
  return dateObj.getTime() - now >= minMinutes * 60 * 1000;
}

/**
 * POST /api/visits
 * Tenant requests a visit
 *
 * ✅ Supports BOTH payloads:
 * A) body: { houseId, start, end, message? }
 * B) body: { houseId, visitAt, durationMins?, message? }
 *    - durationMins default 30
 */
router.post("/", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const { houseId, start, end, visitAt, durationMins, message } = req.body || {};
    if (!houseId) return res.status(400).json({ message: "houseId is required" });

    // ✅ Build slot from either start/end or visitAt
    let slot = null;

    // Option A: start/end
    if (start && end) {
      slot = parseSlot(start, end);
    }

    // Option B: visitAt -> make end = start + duration
    if (!slot && visitAt) {
      const s = new Date(visitAt);
      if (!isNaN(s.getTime())) {
        const mins = Number(durationMins || 30);
        const e = new Date(s.getTime() + mins * 60 * 1000);
        slot = parseSlot(s.toISOString(), e.toISOString());
      }
    }

    if (!slot) return res.status(400).json({ message: "Invalid time slot" });

    // ✅ Enforce future (prevents timezone confusion + accidental past)
    if (!isFutureEnough(slot.start, 30)) {
      return res
        .status(400)
        .json({ message: "Invalid time slot (choose at least 30 mins from now)" });
    }

    const house = await House.findById(houseId).select(
      "landlordId status currentTenantId title location"
    );
    if (!house) return res.status(404).json({ message: "House not found" });

    // cannot schedule if already rented
    if (house.status === "rented" || house.currentTenantId) {
      return res.status(400).json({ message: "This house is already rented." });
    }

    // prevent spam: only 1 active (pending/accepted) request per tenant per house
    const existing = await VisitRequest.findOne({
      houseId,
      tenantId: req.user._id,
      status: { $in: ["pending", "accepted"] },
    });

    if (existing) {
      return res.status(400).json({
        message: `You already have an active visit request for this house (${existing.status}).`,
        visitId: String(existing._id),
        status: existing.status,
      });
    }

    const vr = await VisitRequest.create({
      houseId,
      landlordId: house.landlordId,
      tenantId: req.user._id,
      status: "pending",
      requestedSlot: slot,
      tenantMessage: String(message || "").trim(),
    });

    const populated = await VisitRequest.findById(vr._id)
      .populate("houseId", "title location rent images type")
      .populate("landlordId", "name email phone")
      .populate("tenantId", "name email phone");

    return res.json({ success: true, message: "Visit requested", visit: populated });
  } catch (err) {
    console.error("visit request error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/visits/my
 * Tenant sees their visit requests
 */
router.get("/my", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const visits = await VisitRequest.find({ tenantId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("houseId", "title location rent images type")
      .populate("landlordId", "name email phone");

    return res.json({ success: true, visits });
  } catch (err) {
    console.error("my visits error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/visits/:id/cancel
 * Tenant cancels (only pending/accepted)
 * body: { note? }
 */
router.put("/:id/cancel", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const vr = await VisitRequest.findById(req.params.id);
    if (!vr) return res.status(404).json({ message: "Visit not found" });

    if (String(vr.tenantId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (!["pending", "accepted"].includes(vr.status)) {
      return res.status(400).json({ message: `Cannot cancel from status: ${vr.status}` });
    }

    vr.status = "cancelled";
    const note = String(req.body?.note || "").trim();

    vr.statusHistory = vr.statusHistory || [];
    vr.statusHistory.push({
      status: "cancelled",
      at: new Date(),
      by: req.user._id,
      note: note || "Cancelled by tenant",
    });

    await vr.save();

    return res.json({
      success: true,
      message: "Visit cancelled",
      visitId: String(vr._id),
      status: vr.status,
    });
  } catch (err) {
    console.error("cancel visit error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/visits/landlord
 * Landlord sees incoming visit requests
 */
router.get("/landlord", auth, roleMiddleware("landlord"), async (req, res) => {
  try {
    const visits = await VisitRequest.find({ landlordId: req.user._id })
      .sort({ createdAt: -1 })
      .populate("houseId", "title location rentrent images type")
      .populate("tenantId", "name email phone");

    return res.json({ success: true, visits });
  } catch (err) {
    console.error("landlord visits error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/visits/:id/accept
 * Landlord accepts (can keep same slot or propose new slot)
 * body: { start?, end?, note? }
 */
router.put("/:id/accept", auth, roleMiddleware("landlord"), async (req, res) => {
  try {
    const vr = await VisitRequest.findById(req.params.id);
    if (!vr) return res.status(404).json({ message: "Visit not found" });

    if (String(vr.landlordId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (vr.status !== "pending") {
      return res.status(400).json({ message: `Only pending visits can be accepted. Current: ${vr.status}` });
    }

    let finalSlot = null;
    if (req.body?.start && req.body?.end) {
      finalSlot = parseSlot(req.body.start, req.body.end);
      if (!finalSlot) return res.status(400).json({ message: "Invalid final time slot" });
      if (!isFutureEnough(finalSlot.start, 30)) {
        return res.status(400).json({ message: "Invalid final time slot (must be at least 30 mins from now)" });
      }
    } else {
      finalSlot = { ...vr.requestedSlot };
    }

    vr.status = "accepted";
    vr.finalSlot = finalSlot;
    vr.landlordNote = String(req.body?.note || "").trim();

    vr.statusHistory = vr.statusHistory || [];
    vr.statusHistory.push({
      status: "accepted",
      at: new Date(),
      by: req.user._id,
      note: vr.landlordNote || "Accepted by landlord",
    });

    await vr.save();

    const populated = await VisitRequest.findById(vr._id)
      .populate("houseId", "title location rent images type")
      .populate("tenantId", "name email phone")
      .populate("landlordId", "name email phone");

    return res.json({ success: true, message: "Visit accepted", visit: populated });
  } catch (err) {
    console.error("accept visit error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/visits/:id/reject
 * Landlord rejects pending request
 * body: { note? }
 */
router.put("/:id/reject", auth, roleMiddleware("landlord"), async (req, res) => {
  try {
    const vr = await VisitRequest.findById(req.params.id);
    if (!vr) return res.status(404).json({ message: "Visit not found" });

    if (String(vr.landlordId) !== String(req.user._id)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    if (vr.status !== "pending") {
      return res.status(400).json({ message: `Only pending visits can be rejected. Current: ${vr.status}` });
    }

    vr.status = "rejected";
    vr.landlordNote = String(req.body?.note || "").trim();

    vr.statusHistory = vr.statusHistory || [];
    vr.statusHistory.push({
      status: "rejected",
      at: new Date(),
      by: req.user._id,
      note: vr.landlordNote || "Rejected by landlord",
    });

    await vr.save();

    return res.json({
      success: true,
      message: "Visit rejected",
      visitId: String(vr._id),
      status: vr.status,
    });
  } catch (err) {
    console.error("reject visit error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
