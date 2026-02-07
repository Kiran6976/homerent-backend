const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { sendOtpEmail } = require("../utils/sendEmail");

const router = express.Router();

const createToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 digit

// ✅ REGISTER (creates user + sends OTP)
router.post("/register", async (req, res) => {
  try {
    const { name, age, address, email, password, role, phone } = req.body;

    if (!name || !age || !address || !email || !password || !role) {
      return res.status(400).json({ message: "Please fill in all required fields" });
    }
    if (age < 18) return res.status(400).json({ message: "You must be at least 18 years old" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    const lowerEmail = email.toLowerCase();
    const existingUser = await User.findOne({ email: lowerEmail });

    if (existingUser) {
      // if already verified, block
      if (existingUser.isVerified) {
        return res.status(400).json({ message: "Email already registered" });
      }
      // if not verified, resend OTP
      const otp = generateOtp();
      existingUser.otpCodeHash = await bcrypt.hash(otp, 10);
      existingUser.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      existingUser.otpAttempts = 0;
      await existingUser.save();

      await sendOtpEmail(lowerEmail, otp);
      return res.status(200).json({
        success: true,
        message: "OTP resent. Please verify your email.",
      });
    }

    const otp = generateOtp();

    const user = new User({
      name,
      age,
      address,
      email: lowerEmail,
      passwordHash: password,
      role,
      phone,
      isVerified: false,
      otpCodeHash: await bcrypt.hash(otp, 10),
      otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
      otpAttempts: 0,
    });

    await user.save();
    await sendOtpEmail(lowerEmail, otp);

    res.status(201).json({
      success: true,
      message: "Registered. OTP sent to email. Please verify.",
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ VERIFY OTP
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (user.isVerified) {
      return res.status(200).json({ success: true, message: "Already verified" });
    }

    if (!user.otpCodeHash || !user.otpExpiresAt) {
      return res.status(400).json({ message: "OTP not found. Please request a new OTP." });
    }

    if (user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "OTP expired. Please request a new OTP." });
    }

    // optional brute-force protection
    if (user.otpAttempts >= 5) {
      return res.status(429).json({ message: "Too many attempts. Please request a new OTP." });
    }

    const ok = await bcrypt.compare(String(otp), user.otpCodeHash);
    if (!ok) {
      user.otpAttempts += 1;
      await user.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.isVerified = true;
    user.otpCodeHash = null;
    user.otpExpiresAt = null;
    user.otpAttempts = 0;
    await user.save();

    // ✅ token after verification (nice UX)
    const token = createToken(user._id, user.role);

    res.json({
      success: true,
      message: "Email verified successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        address: user.address,
        phone: user.phone,
        age: user.age,
      },
    });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ RESEND OTP (optional separate endpoint)
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.isVerified) return res.status(400).json({ message: "Email already verified" });

    const otp = generateOtp();
    user.otpCodeHash = await bcrypt.hash(otp, 10);
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    user.otpAttempts = 0;
    await user.save();

    await sendOtpEmail(user.email, otp);
    res.json({ success: true, message: "OTP sent again" });
  } catch (err) {
    console.error("Resend OTP error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ LOGIN (only if verified)
// ✅ LOGIN (OTP required for tenant/landlord, NOT required for admin)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    // ✅ Only tenant/landlord must verify email
    if (!user.isVerified && user.role !== "admin") {
      return res.status(403).json({ message: "Please verify your email first" });
    }

    // Safety check (prevents bcrypt crash if old records exist)
    if (!user.passwordHash) {
      return res.status(400).json({
        message: "Password not set for this account. Please register again.",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = createToken(user._id, user.role);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        address: user.address,
        phone: user.phone,
        age: user.age,
        isVerified: user.isVerified,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ ME
router.get("/me", authMiddleware, async (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      address: req.user.address,
      phone: req.user.phone,
      age: req.user.age,
    },
  });
});

module.exports = router;
