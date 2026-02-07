const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      // options are optional in mongoose 6/7, but fine to keep clean
    });

    // ✅ Reliable logs
    const dbName =
      conn.connection.db?.databaseName ||
      mongoose.connection.db?.databaseName ||
      mongoose.connection.name;

    console.log("MongoDB Connected:", conn.connection.host);
    console.log("Connected DB Name:", dbName);
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
