const mongoose = require("mongoose");

// ✅ Import User model so indexes are known to mongoose
require("../models/User");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);

    const dbName =
      conn.connection.db?.databaseName ||
      mongoose.connection.db?.databaseName ||
      mongoose.connection.name;

    console.log("MongoDB Connected:", conn.connection.host);
    console.log("Connected DB Name:", dbName);

    // ✅ IMPORTANT: ensure indexes exist (especially unique aadhaarHash)
    // This will create the unique+sparse index if missing.
    await mongoose.connection.syncIndexes();
    console.log("✅ MongoDB indexes synced");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
