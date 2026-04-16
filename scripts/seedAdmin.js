/**
 * seedAdmin.js — One-time script to add a new admin user to MongoDB.
 * Run: node scripts/seedAdmin.js
 */

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const User     = require("../models/User");

const ADMIN_EMAIL    = "mamandasadmin@gmail.com";
const ADMIN_PASSWORD = "Maman@123";
const ADMIN_NAME     = "Mamanda Admin";

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  const existing = await User.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log("⚠️  Admin already exists:", ADMIN_EMAIL);
    await mongoose.disconnect();
    return;
  }

  const salt         = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, salt);

  // Use raw insertOne to bypass the Mongoose pre-save hook (which would double-hash).
  await mongoose.connection.collection("users").insertOne({
    name:         ADMIN_NAME,
    email:        ADMIN_EMAIL.toLowerCase(),
    passwordHash,
    role:         "admin",
    age:          30,
    address:      "Admin Office",
    isVerified:   true,
    createdAt:    new Date(),
    updatedAt:    new Date(),
  });

  console.log("🎉 Admin user created successfully!");
  console.log("   Email   :", ADMIN_EMAIL);
  console.log("   Password:", ADMIN_PASSWORD);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  process.exit(1);
});
