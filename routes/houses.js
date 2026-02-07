const express = require("express");
const House = require("../models/House");
const authMiddleware = require("../middleware/auth");
const { roleMiddleware, ownerMiddleware } = require("../middleware/role");
const User = require("../models/User"); // at top if not already

const router = express.Router();

// @route   GET /api/houses
// @desc    Get all houses (with filters)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const { location, minRent, maxRent, type, beds, search } = req.query;

    let query = {};

    if (location) {
      query.location = { $regex: location, $options: "i" };
    }

    if (minRent || maxRent) {
      query.rent = {};
      if (minRent) query.rent.$gte = Number(minRent);
      if (maxRent) query.rent.$lte = Number(maxRent);
    }

    if (type) {
      query.type = type;
    }

    if (beds) {
      query.beds = { $gte: Number(beds) };
    }

    if (search) {
      query.$text = { $search: search };
    }

    const houses = await House.find(query)
      .sort({ createdAt: -1 })
      .populate("landlordId", "name email phone");

    res.json(houses);
  } catch (error) {
    console.error("Get houses error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ IMPORTANT:
 * Put specific routes ABOVE "/:id"
 */

// @route   GET /api/houses/landlord/my-houses
// @desc    Get current landlord's houses
// @access  Private (Landlord only)
router.get(
  "/landlord/my-houses",
  authMiddleware,
  roleMiddleware("landlord"),
  async (req, res) => {
    try {
      const houses = await House.find({ landlordId: req.user._id }).sort({
        createdAt: -1,
      });
      res.json(houses);
    } catch (error) {
      console.error("Get my houses error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// ✅ Alias route (because your frontend is calling /api/houses/my)
router.get(
  "/my",
  authMiddleware,
  roleMiddleware("landlord"),
  async (req, res) => {
    try {
      const houses = await House.find({ landlordId: req.user._id }).sort({
        createdAt: -1,
      });
      res.json(houses);
    } catch (error) {
      console.error("Get /my houses error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   POST /api/houses
// @desc    Create a new house
// @access  Private (Landlord only)
router.post("/", authMiddleware, roleMiddleware("landlord"), async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      rent,
      deposit,
      type,
      beds,
      baths,
      area,
      furnished,
      amenities,
      images,
      availability,
    } = req.body;

    // Validation
    if (!title || !description || !location || !rent || !deposit) {
      return res
        .status(400)
        .json({ message: "Please fill in all required fields" });
    }

    if (rent <= 0 || deposit <= 0) {
      return res
        .status(400)
        .json({ message: "Rent and deposit must be positive numbers" });
    }

    const house = new House({
      landlordId: req.user._id, // ✅ Always from token (safe)
      title,
      description,
      location,
      rent,
      deposit,
      type,
      beds,
      baths,
      area,
      furnished,
      amenities,
      images,
      availability,
    });

    await house.save();

    res.status(201).json({
      success: true,
      message: "House created successfully",
      house,
    });
  } catch (error) {
    console.error("Create house error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   GET /api/houses/:id
// @desc    Get house by ID
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const house = await House.findById(req.params.id).populate(
      "landlordId",
      "name email phone address"
    );

    if (!house) {
      return res.status(404).json({ message: "House not found" });
    }

    res.json(house);
  } catch (error) {
    console.error("Get house error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   PUT /api/houses/:id
// @desc    Update a house
// @access  Private (Owner only)
router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("landlord"),
  ownerMiddleware(House),
  async (req, res) => {
    try {
      const updates = req.body;

      // Prevent changing landlordId
      delete updates.landlordId;

      const house = await House.findByIdAndUpdate(
        req.params.id,
        { $set: updates },
        { new: true, runValidators: true }
      );

      res.json({
        success: true,
        message: "House updated successfully",
        house,
      });
    } catch (error) {
      console.error("Update house error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

// @route   DELETE /api/houses/:id
// @desc    Delete a house
// @access  Private (Owner only)
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("landlord"),
  ownerMiddleware(House),
  async (req, res) => {
    try {
      await House.findByIdAndDelete(req.params.id);

      res.json({
        success: true,
        message: "House deleted successfully",
      });
    } catch (error) {
      console.error("Delete house error:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * GET /api/houses/:id/payment
 * Returns UPI link + booking amount for this house
 */
router.get("/:id/payment", authMiddleware, async (req, res) => {
  try {
    const house = await House.findById(req.params.id).populate("landlordId", "name upiId");
    if (!house) return res.status(404).json({ message: "House not found" });

    const landlord = house.landlordId;
    if (!landlord?.upiId) {
      return res.status(400).json({ message: "Landlord has not set UPI ID yet" });
    }

    const bookingAmount = Number(house.bookingAmount || 0);
    if (!bookingAmount || bookingAmount <= 0) {
      return res.status(400).json({ message: "Booking amount is not set for this house" });
    }

    // UPI deep link (unique per house via tn)
    const pa = encodeURIComponent(landlord.upiId);
    const pn = encodeURIComponent(landlord.name || "Landlord");
    const am = encodeURIComponent(String(bookingAmount));
    const tn = encodeURIComponent(`HomeRent Booking - ${house._id}`);

    const upiLink = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;

    res.json({
      success: true,
      houseId: String(house._id),
      landlordName: landlord.name,
      upiId: landlord.upiId,
      bookingAmount,
      currency: "INR",
      upiLink,
    });
  } catch (err) {
    console.error("House payment error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;
