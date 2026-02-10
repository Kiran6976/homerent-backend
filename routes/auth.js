// routes/auth.js (FULL UPDATED FILE - includes upiId in responses + forgot/reset password)
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { sendOtpEmail, sendResetPasswordEmail } = require("../utils/sendEmail");

const router = express.Router();

const createToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 digit

// ✅ IMPORTANT: always send upiId back to frontend
const userResponse = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  address: user.address,
  phone: user.phone,
  age: user.age,
  isVerified: user.isVerified,

  // ✅ UPI (Landlord)
  upiId: user.upiId || null,

  // (keep if you still use these)
  razorpayAccountId: user.razorpayAccountId,
  razorpayAccountStatus: user.razorpayAccountStatus,
  razorpayRequirements: user.razorpayRequirements,
});

// ✅ REGISTER (creates user + sends OTP)
router.post("/register", async (req, res) => {
  try {
    const { name, age, address, email, password, role, phone } = req.body;

    if (!name || !email || !password || !role || age === undefined || !address) {
      return res.status(400).json({ message: "Please fill in all required fields" });
    }

    const ageNum = Number(age);
    if (Number.isNaN(ageNum)) {
      return res.status(400).json({ message: "Age must be a valid number" });
    }
    if (ageNum < 18) return res.status(400).json({ message: "You must be at least 18 years old" });

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const lowerEmail = String(email).toLowerCase().trim();
    const existingUser = await User.findOne({ email: lowerEmail });

    // If user exists
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

      // Optional: update details if user tried again
      existingUser.name = String(name).trim();
      existingUser.age = ageNum;
      existingUser.address = String(address).trim();
      existingUser.role = role;
      if (phone !== undefined) existingUser.phone = phone;

      /**
       * ✅ IMPORTANT FIX:
       * Do NOT bcrypt.hash here because your User model already hashes in pre("save")
       * If you hash here, it becomes DOUBLE HASHED and login fails.
       */
      existingUser.passwordHash = String(password);

      await existingUser.save();
      await sendOtpEmail(lowerEmail, otp);

      return res.status(200).json({
        success: true,
        message: "OTP resent. Please verify your email.",
      });
    }

    // Create new user
    const otp = generateOtp();

    /**
     * ✅ IMPORTANT FIX:
     * Do NOT bcrypt.hash here because your User model already hashes in pre("save")
     */
    const user = new User({
      name: String(name).trim(),
      age: ageNum,
      address: String(address).trim(),
      email: lowerEmail,
      passwordHash: String(password), // ✅ plain here, model will hash
      role,
      phone,
      isVerified: false,
      otpCodeHash: await bcrypt.hash(otp, 10),
      otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
      otpAttempts: 0,

      // ✅ UPI default (optional)
      upiId: null,
    });

    await user.save();
    await sendOtpEmail(lowerEmail, otp);

    return res.status(201).json({
      success: true,
      message: "Registered. OTP sent to email. Please verify.",
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ VERIFY OTP
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "User not found" });

    if (user.isVerified) {
      const token = createToken(user._id, user.role);
      return res.status(200).json({
        success: true,
        message: "Already verified",
        token,
        user: userResponse(user),
      });
    }

    if (!user.otpCodeHash || !user.otpExpiresAt) {
      return res.status(400).json({ message: "OTP not found. Please request a new OTP." });
    }

    if (user.otpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "OTP expired. Please request a new OTP." });
    }

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

    const token = createToken(user._id, user.role);

    return res.json({
      success: true,
      message: "Email verified successfully",
      token,
      user: userResponse(user),
    });
  } catch (err) {
    console.error("Verify error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ RESEND OTP
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "User not found" });
    if (user.isVerified) return res.status(400).json({ message: "Email already verified" });

    const otp = generateOtp();
    user.otpCodeHash = await bcrypt.hash(otp, 10);
    user.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    user.otpAttempts = 0;
    await user.save();

    await sendOtpEmail(user.email, otp);
    return res.json({ success: true, message: "OTP sent again" });
  } catch (err) {
    console.error("Resend OTP error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ LOGIN (OTP required for tenant/landlord, NOT required for admin)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password" });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    if (!user.isVerified && user.role !== "admin") {
      return res.status(403).json({ message: "Please verify your email first" });
    }

    if (!user.passwordHash) {
      return res.status(400).json({
        message: "Password not set for this account. Please register again.",
      });
    }

    // uses your model method
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = createToken(user._id, user.role);

    return res.json({
      success: true,
      token,
      user: userResponse(user),
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ FORGOT PASSWORD (send reset link)
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const lowerEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: lowerEmail });

    // ✅ Don't reveal if email exists (security best practice)
    const genericMsg = "If an account exists with this email, a reset link has been sent.";

    if (!user) {
      return res.json({ success: true, message: genericMsg });
    }

    // Create token (raw) + store hash in DB
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    user.passwordResetTokenHash = tokenHash;
    user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min
    await user.save();

    // Build frontend reset link
    // ✅ Set FRONTEND_URL in .env (fallback to CLIENT_URL)
    const baseUrl = process.env.FRONTEND_URL || process.env.CLIENT_URL;
    const resetLink = `${baseUrl}/reset-password/${rawToken}`;

    await sendResetPasswordEmail(user.email, resetLink);

    return res.json({ success: true, message: genericMsg });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ RESET PASSWORD (verify token + set new password)
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) return res.status(400).json({ message: "Token missing" });
    if (!password) return res.status(400).json({ message: "Password is required" });

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const tokenHash = crypto.createHash("sha256").update(String(token)).digest("hex");

    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    });

    if (!user) {
      return res.status(400).json({ message: "Reset link is invalid or expired" });
    }

    // ✅ IMPORTANT:
    // Set passwordHash = plain password. Your pre("save") will hash it.
    user.passwordHash = String(password);

    // Clear reset fields
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;

    await user.save();

    return res.json({
      success: true,
      message: "Password updated successfully. Please login.",
    });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ ME
router.get("/me", authMiddleware, async (req, res) => {
  return res.json({ user: userResponse(req.user) });
});

module.exports = router;
