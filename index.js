const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

dotenv.config();

const app = express();

const visitsRoutes = require("./routes/visits");

// ✅ Connect to MongoDB
connectDB();

/**
 * ✅ CORS
 * - In dev: allows all (so localhost works)
 * - In prod: set CLIENT_URL in Render (e.g. https://your-frontend.vercel.app)
 */
const allowedOrigins = [process.env.CLIENT_URL].filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length === 0) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);

// ✅ IMPORTANT: Capture raw body for Razorpay webhook signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ✅ Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/houses", require("./routes/houses"));
app.use("/api/uploads", require("./routes/uploads"));
app.use("/api/landlord", require("./routes/landlord"));
app.use("/api/users", require("./routes/users"));

/**
 * ✅ Admin routes
 * - Keep your existing admin routes in ./routes/admin
 * - Add payments admin routes separately
 */
app.use("/api/admin", require("./routes/admin"));
app.use("/api/admin", require("./routes/adminPayments")); // ✅ NEW

// ✅ Booking + payment routes
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/payments", require("./routes/payments"));
app.use("/api/visits", visitsRoutes);
app.use("/api/rent-payments", require("./routes/rentPayments"));


// ❌ Remove Razorpay Route routes (no longer used)
// app.use("/api/route", require("./routes/route"));

// ✅ Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Server is running" });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
