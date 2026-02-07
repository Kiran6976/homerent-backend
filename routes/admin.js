const express = require("express");
const User = require("../models/User");
const House = require("../models/House");
const authMiddleware = require("../middleware/auth");
const { roleMiddleware } = require("../middleware/role");

const router = express.Router();

/**
 * GET /api/admin/users?role=landlord|tenant
 * Admin: get users by role
 */
router.get("/users", authMiddleware, roleMiddleware("admin"), async (req, res) => {
  try {
    const { role } = req.query;

    const query = {};
    if (role) query.role = role;

    const users = await User.find(query)
      .select("-passwordHash")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (err) {
    console.error("Admin get users error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * PATCH /api/admin/users/:id/verify
 * Admin: verify/unverify landlord
 * body: { isVerified: true/false }
 */
router.patch(
  "/users/:id/verify",
  authMiddleware,
  roleMiddleware("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { isVerified } = req.body;

      if (typeof isVerified !== "boolean") {
        return res.status(400).json({ message: "isVerified must be boolean" });
      }

      const user = await User.findById(id);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Only landlords should be verified
      if (user.role !== "landlord") {
        return res.status(400).json({ message: "Only landlords can be verified" });
      }

      user.isVerified = isVerified;
      await user.save();

      res.json({
        success: true,
        message: isVerified ? "Landlord verified" : "Landlord unverified",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          address: user.address,
          phone: user.phone,
          isVerified: user.isVerified,
        },
      });
    } catch (err) {
      console.error("Admin verify landlord error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * DELETE /api/admin/users/:id
 * Admin: delete tenant/landlord
 * - prevents deleting admin
 * - if landlord: deletes all houses posted by that landlord
 */
router.delete("/users/:id", authMiddleware, roleMiddleware("admin"), async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Safety: never delete admin via API
    if (user.role === "admin") {
      return res.status(403).json({ message: "Admin user cannot be deleted" });
    }

    // If landlord, remove houses first (avoid orphan houses)
    if (user.role === "landlord") {
      await House.deleteMany({ landlordId: user._id });
    }

    await User.findByIdAndDelete(user._id);

    res.json({
      success: true,
      message: `${user.role} deleted successfully`,
    });
  } catch (err) {
    console.error("Admin delete user error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/admin/houses
 * Admin: view all houses uploaded by landlords
 * Query (optional): ?status=available|rented  ?search=ramnagar
 */
router.get("/houses", authMiddleware, roleMiddleware("admin"), async (req, res) => {
  try {
    const { status, search } = req.query;

    const query = {};
    if (status) query.status = status;

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [
        { title: regex },
        { address: regex },
        { city: regex },
        { location: regex },
        { description: regex },
      ];
    }

    // Populate landlord details (name/email/phone)
    const houses = await House.find(query)
      .sort({ createdAt: -1 })
      .populate("landlordId", "name email phone");

    res.json({ success: true, houses });
  } catch (err) {
    console.error("Admin get houses error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * DELETE /api/admin/houses/:id
 * Admin: delete any house
 */
router.delete("/houses/:id", authMiddleware, roleMiddleware("admin"), async (req, res) => {
  try {
    const { id } = req.params;

    const house = await House.findById(id);
    if (!house) return res.status(404).json({ message: "House not found" });

    await House.findByIdAndDelete(id);

    res.json({ success: true, message: "House deleted successfully" });
  } catch (err) {
    console.error("Admin delete house error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
