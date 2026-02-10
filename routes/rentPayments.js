// routes/rentPayments.js (FULL UPDATED FILE)
const express = require("express");
const auth = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");
const House = require("../models/House");
const User = require("../models/User");
const RentPayment = require("../models/RentPayment");

const router = express.Router();

const canTenantPayForHouse = async ({ houseId, tenantId }) => {
  const house = await House.findById(houseId).select("landlordId rent status currentTenantId");
  if (!house) return { ok: false, message: "House not found" };

  // ✅ tenant can pay only if this house is actually rented by him
  if (!house.currentTenantId || String(house.currentTenantId) !== String(tenantId)) {
    return { ok: false, message: "You are not the current tenant of this house" };
  }

  return { ok: true, house };
};

// ✅ Tenant initiates rent payment for a month
router.post("/initiate", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const { houseId, period } = req.body;
    if (!houseId) return res.status(400).json({ message: "houseId is required" });

    // YYYY-MM default (current month)
    const now = new Date();
    const defaultPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const safePeriod = String(period || defaultPeriod).trim();

    const check = await canTenantPayForHouse({ houseId, tenantId: req.user._id });
    if (!check.ok) return res.status(400).json({ message: check.message });
    const house = check.house;

    const amount = Number(house.rent || 0);
    if (!amount || amount <= 0) return res.status(400).json({ message: "Monthly rent not set" });

    const landlord = await User.findById(house.landlordId).select("name upiId role");
    if (!landlord || landlord.role !== "landlord") return res.status(400).json({ message: "Invalid landlord" });

    const landlordUpi = String(landlord.upiId || "").trim();
    if (!landlordUpi) return res.status(400).json({ message: "Landlord UPI is not set" });

    // ✅ create record (unique per month)
    let payment;
    try {
      payment = await RentPayment.create({
        houseId: house._id,
        landlordId: landlord._id,
        tenantId: req.user._id,
        period: safePeriod,
        amount,
        status: "initiated",
        statusHistory: [{ status: "initiated", at: new Date(), by: req.user._id, note: "Rent payment initiated" }],
      });
    } catch (e) {
      // duplicate month -> fetch existing
      if (e?.code === 11000) {
        const existing = await RentPayment.findOne({ houseId: house._id, tenantId: req.user._id, period: safePeriod });
        return res.status(400).json({
          message: "Rent for this month already exists",
          paymentId: existing?._id,
          status: existing?.status,
        });
      }
      throw e;
    }

    // ✅ UPI deep link
    const pa = encodeURIComponent(landlordUpi);
    const pn = encodeURIComponent(landlord.name || "Landlord");
    const am = encodeURIComponent(String(amount));
    const tn = encodeURIComponent(`HomeRent Rent ${safePeriod} | ${payment._id}`);

    const upiLink = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;

    return res.json({
      success: true,
      paymentId: String(payment._id),
      amount,
      period: safePeriod,
      upiLink,
      payee: { name: landlord.name, upiId: landlordUpi },
      house: { id: String(house._id) },
    });
  } catch (err) {
    console.error("rent initiate error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Tenant submits UTR + optional proof
router.post("/:id/mark-paid", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const payment = await RentPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (String(payment.tenantId) !== String(req.user._id)) return res.status(403).json({ message: "Forbidden" });

    if (["approved"].includes(payment.status)) {
      return res.status(400).json({ message: "Already approved" });
    }

    const utr = String(req.body?.utr || "").trim();
    const proofUrl = String(req.body?.proofUrl || "").trim();
    if (!utr) return res.status(400).json({ message: "UTR is required" });

    payment.status = "payment_submitted";
    payment.tenantUtr = utr;
    payment.paymentProofUrl = proofUrl;
    payment.paymentSubmittedAt = new Date();
    payment.statusHistory = payment.statusHistory || [];
    payment.statusHistory.push({
      status: "payment_submitted",
      at: new Date(),
      by: req.user._id,
      note: `UTR: ${utr}`,
    });

    await payment.save();

    return res.json({ success: true, paymentId: String(payment._id), status: payment.status });
  } catch (err) {
    console.error("rent mark-paid error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Tenant history for one rented house
router.get("/my/:houseId", auth, roleMiddleware("tenant"), async (req, res) => {
  try {
    const houseId = req.params.houseId;

    const list = await RentPayment.find({ houseId, tenantId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, payments: list });
  } catch (err) {
    console.error("rent my history error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Landlord pending approvals (only payment_submitted)
router.get("/landlord/pending", auth, roleMiddleware("landlord"), async (req, res) => {
  try {
    const list = await RentPayment.find({
      landlordId: req.user._id,
      status: "payment_submitted",
    })
      .sort({ createdAt: -1 })
      .populate("tenantId", "name email phone")
      .populate("houseId", "title location rent")
      .lean();

    return res.json({ success: true, payments: list });
  } catch (err) {
    console.error("landlord pending rent error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Landlord "folders" (group by tenant)
router.get("/landlord/folders", auth, roleMiddleware("landlord"), async (req, res) => {
  try {
    const rows = await RentPayment.find({ landlordId: req.user._id })
      .populate("tenantId", "name email phone")
      .sort({ updatedAt: -1 })
      .lean();

    const map = new Map();

    for (const p of rows) {
      const tenantObj = p.tenantId;
      const tid = String(tenantObj?._id || tenantObj);

      if (!map.has(tid)) {
        map.set(tid, {
          tenant: tenantObj,
          totalPayments: 0,
          pending: 0,
          lastActivityAt: p.updatedAt || p.createdAt,
        });
      }

      const folder = map.get(tid);
      folder.totalPayments += 1;
      if (p.status === "payment_submitted") folder.pending += 1;

      const t = new Date(p.updatedAt || p.createdAt).getTime();
      const cur = new Date(folder.lastActivityAt).getTime();
      if (t > cur) folder.lastActivityAt = p.updatedAt || p.createdAt;
    }

    const folders = Array.from(map.values()).sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );

    return res.json({ success: true, folders });
  } catch (err) {
    console.error("rent folders error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Landlord view: all rent payments of one tenant
router.get("/landlord/tenant/:tenantId", auth, roleMiddleware("landlord"), async (req, res) => {
  try {
    const tenantId = req.params.tenantId;

    const payments = await RentPayment.find({
      landlordId: req.user._id,
      tenantId,
    })
      .populate("houseId", "title location rent")
      .sort({ period: -1, createdAt: -1 })
      .lean();

    return res.json({ success: true, payments });
  } catch (err) {
    console.error("rent tenant history error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Landlord approves
router.put("/:id/approve", auth, roleMiddleware("landlord"), async (req, res) => {
  try {
    const payment = await RentPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (String(payment.landlordId) !== String(req.user._id)) return res.status(403).json({ message: "Forbidden" });

    payment.status = "approved";
    payment.approvedAt = new Date();
    payment.statusHistory = payment.statusHistory || [];
    payment.statusHistory.push({ status: "approved", at: new Date(), by: req.user._id, note: "Approved by landlord" });
    await payment.save();

    return res.json({ success: true, status: payment.status });
  } catch (err) {
    console.error("rent approve error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ✅ Landlord rejects
router.put("/:id/reject", auth, roleMiddleware("landlord"), async (req, res) => {
  try {
    const payment = await RentPayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (String(payment.landlordId) !== String(req.user._id)) return res.status(403).json({ message: "Forbidden" });

    const note = String(req.body?.note || "").trim();

    payment.status = "rejected";
    payment.rejectedAt = new Date();
    payment.rejectionNote = note;
    payment.statusHistory = payment.statusHistory || [];
    payment.statusHistory.push({ status: "rejected", at: new Date(), by: req.user._id, note: note || "Rejected" });

    await payment.save();

    return res.json({ success: true, status: payment.status });
  } catch (err) {
    console.error("rent reject error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
