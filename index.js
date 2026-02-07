const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();

const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());

// ✅ IMPORTANT: Capture raw body for Razorpay webhook signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // for Razorpay webhook signature
    },
  })
);

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/houses", require("./routes/houses"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/uploads", require("./routes/uploads"));
app.use("/api/landlord", require("./routes/landlord"));
app.use("/api/users", require("./routes/users"));

// ✅ NEW: Razorpay + Route + Booking routes
app.use("/api/route", require("./routes/route"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/payments", require("./routes/payments"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
