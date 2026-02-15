// routes/auth.js (FULL UPDATED FILE - adds resend reset OTP route)
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { sendOtpEmail, sendResetPasswordOtpEmail } = require("../utils/sendEmail");

const router = express.Router();

const createToken = (userId, role) =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 digit

// ✅ Aadhaar helpers (basic validation: 12 digits)
const cleanAadhaar = (v) => String(v || "").replace(/\D/g, "").slice(0, 12);
const isValidAadhaarFormat = (v) => /^\d{12}$/.test(v);

// ✅ Aadhaar hash (for uniqueness)
// Env: AADHAAR_HASH_PEPPER (any long secret string)
const hashAadhaar = (plain12) => {
  const pepper = process.env.AADHAAR_HASH_PEPPER || "";
  return crypto
    .createHash("sha256")
    .update(String(plain12) + pepper)
    .digest("hex");
};

// ✅ Encryption helpers (AES-256-GCM)
// Env: AADHAAR_ENC_KEY (hex 64 chars OR base64 32 bytes)
const getEncKey = () => {
  const raw = process.env.AADHAAR_ENC_KEY;
  if (!raw) throw new Error("AADHAAR_ENC_KEY missing in env");

  // try hex
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");

  // try base64
  const b = Buffer.from(raw, "base64");
  if (b.length === 32) return b;

  throw new Error("AADHAAR_ENC_KEY must be 32 bytes (hex64 or base64)");
};

const encryptAadhaar = (plain) => {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  // store as: iv:tag:data (base64)
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
};

// (Optional) use this later in admin routes to view full number
const decryptAadhaar = (blob) => {
  const key = getEncKey();
  const [ivB64, tagB64, dataB64] = String(blob || "").split(":");
  if (!ivB64 || !tagB64 || !dataB64) return null;

  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
};

// ✅ IMPORTANT: send only safe fields to frontend
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

  // ✅ Aadhaar (safe fields only)
  aadhaarLast4: user.aadhaarLast4 || null,
  aadhaarVerified: !!user.aadhaarVerified,

  // (keep if you still use these)
  razorpayAccountId: user.razorpayAccountId,
  razorpayAccountStatus: user.razorpayAccountStatus,
  razorpayRequirements: user.razorpayRequirements,
});

// ✅ REGISTER (creates user + sends OTP)
// accepts optional: aadhaarNumber (ONLY for landlord)
router.post("/register", async (req, res) => {
  try {
    const { name, age, address, email, password, role, phone, aadhaarNumber } = req.body;

    if (!name || !email || !password || !role || age === undefined || !address) {
      return res.status(400).json({ message: "Please fill in all required fields" });
    }

    const ageNum = Number(age);
    if (Number.isNaN(ageNum)) return res.status(400).json({ message: "Age must be a valid number" });
    if (ageNum < 18) return res.status(400).json({ message: "You must be at least 18 years old" });

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const lowerEmail = String(email).toLowerCase().trim();

    // ✅ Aadhaar: only required for landlord
    let aadhaarCleaned = null;
    let aadhaarLast4 = null;
    let aadhaarEnc = null;
    let aadhaarHash = null; // ✅ NEW

    if (String(role) === "landlord") {
      aadhaarCleaned = cleanAadhaar(aadhaarNumber);
      if (!isValidAadhaarFormat(aadhaarCleaned)) {
        return res.status(400).json({ message: "Please enter a valid 12-digit Aadhaar number" });
      }
      aadhaarLast4 = aadhaarCleaned.slice(-4);
      aadhaarEnc = encryptAadhaar(aadhaarCleaned);

      // ✅ NEW: stable hash for uniqueness
      aadhaarHash = hashAadhaar(aadhaarCleaned);
    }

    const existingUser = await User.findOne({ email: lowerEmail });

    // If user exists
    if (existingUser) {
      // if already verified, block
      if (existingUser.isVerified) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // ✅ If landlord: check Aadhaar uniqueness (exclude same user)
      if (String(role) === "landlord") {
        const conflict = await User.findOne({
          aadhaarHash,
          _id: { $ne: existingUser._id },
        }).select("_id");

        if (conflict) {
          return res.status(400).json({ message: "Aadhaar already registered with another account" });
        }
      }

      // if not verified, resend OTP
      const otp = generateOtp();
      existingUser.otpCodeHash = await bcrypt.hash(otp, 10);
      existingUser.otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
      existingUser.otpAttempts = 0;

      // update details
      existingUser.name = String(name).trim();
      existingUser.age = ageNum;
      existingUser.address = String(address).trim();
      existingUser.role = role;
      if (phone !== undefined) existingUser.phone = phone;

      // ✅ update Aadhaar safely if landlord
      if (String(role) === "landlord") {
        existingUser.aadhaarLast4 = aadhaarLast4;
        existingUser.aadhaarEnc = aadhaarEnc;

        // ✅ NEW
        existingUser.aadhaarHash = aadhaarHash;

        existingUser.aadhaarVerified = false;
        existingUser.aadhaarVerificationNote = "";
      } else {
        // if switching away from landlord during re-register, clear
        existingUser.aadhaarLast4 = null;
        existingUser.aadhaarEnc = null;

        // ✅ NEW
        existingUser.aadhaarHash = null;

        existingUser.aadhaarVerified = false;
        existingUser.aadhaarVerificationNote = "";
      }

      // ✅ IMPORTANT: don't bcrypt.hash here (pre-save already hashes)
      existingUser.passwordHash = String(password);

      await existingUser.save();
      await sendOtpEmail(lowerEmail, otp);

      return res.status(200).json({
        success: true,
        message: "OTP resent. Please verify your email.",
      });
    }

    // ✅ NEW USER FLOW
    // ✅ If landlord: check Aadhaar uniqueness before creating user
    if (String(role) === "landlord") {
      const conflict = await User.findOne({ aadhaarHash }).select("_id");
      if (conflict) {
        return res.status(400).json({ message: "Aadhaar already registered with another account" });
      }
    }

    // Create new user
    const otp = generateOtp();

    const user = new User({
      name: String(name).trim(),
      age: ageNum,
      address: String(address).trim(),
      email: lowerEmail,
      passwordHash: String(password),
      role,
      phone,
      isVerified: false,
      otpCodeHash: await bcrypt.hash(otp, 10),
      otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      otpAttempts: 0,
      upiId: null,

      // ✅ Aadhaar (only for landlords)
      aadhaarLast4: String(role) === "landlord" ? aadhaarLast4 : null,
      aadhaarEnc: String(role) === "landlord" ? aadhaarEnc : null,

      // ✅ NEW
      aadhaarHash: String(role) === "landlord" ? aadhaarHash : null,

      aadhaarVerified: false,
      aadhaarVerificationNote: "",
    });

    await user.save();
    await sendOtpEmail(lowerEmail, otp);

    return res.status(201).json({
      success: true,
      message: "Registered. OTP sent to email. Please verify.",
    });
  } catch (err) {
    console.error("Registration error:", err);

    // ✅ NEW: handle duplicate Aadhaar hash unique index
    if (err && err.code === 11000 && err.keyPattern?.aadhaarHash) {
      return res.status(400).json({ message: "Aadhaar already registered with another account" });
    }

    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ VERIFY OTP
router.post("/verify-email", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required" });

    // ✅ FIX: otpCodeHash is select:false in schema, so explicitly include it
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select("+otpCodeHash");
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

// ✅ RESEND OTP (REGISTER EMAIL VERIFICATION)
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

// ✅ LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Please provide email and password" });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    if (!user.isVerified && user.role !== "admin") {
      return res.status(403).json({ message: "Please verify your email first" });
    }

    if (!user.passwordHash) {
      return res.status(400).json({ message: "Password not set for this account. Please register again." });
    }

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

// ✅ FORGOT PASSWORD OTP (send)
router.post("/forgot-password-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const lowerEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: lowerEmail });

    const genericMsg = "If an account exists with this email, an OTP has been sent.";
    if (!user) return res.json({ success: true, message: genericMsg });

    const otp = generateOtp();
    user.passwordResetOtpHash = await bcrypt.hash(otp, 10);
    user.passwordResetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    user.passwordResetOtpAttempts = 0;
    await user.save();

    await sendResetPasswordOtpEmail(user.email, otp);
    return res.json({ success: true, message: genericMsg });
  } catch (err) {
    console.error("Forgot password OTP error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ RESEND RESET PASSWORD OTP (NEW)
router.post("/forgot-password-otp/resend", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email is required" });

    const lowerEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: lowerEmail });

    const genericMsg = "If an account exists with this email, an OTP has been sent.";
    if (!user) return res.json({ success: true, message: genericMsg });

    // ✅ Optional cooldown: block very frequent resends (30s)
    const now = Date.now();
    const expiresAt = user.passwordResetOtpExpiresAt?.getTime() || 0;
    const stillValid = expiresAt > now;

    if (stillValid) {
      const issuedAtApprox = expiresAt - 10 * 60 * 1000; // since you set 10 mins expiry
      const secondsSinceIssued = Math.floor((now - issuedAtApprox) / 1000);
      if (secondsSinceIssued < 30) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${30 - secondsSinceIssued}s before resending OTP.`,
        });
      }
    }

    const otp = generateOtp();
    user.passwordResetOtpHash = await bcrypt.hash(otp, 10);
    user.passwordResetOtpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    user.passwordResetOtpAttempts = 0;
    await user.save();

    await sendResetPasswordOtpEmail(user.email, otp);
    return res.json({ success: true, message: "OTP resent to your email." });
  } catch (err) {
    console.error("Resend reset OTP error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ RESET PASSWORD USING OTP
router.post("/reset-password-otp", async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return res.status(400).json({ message: "Email, OTP and password are required" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const lowerEmail = String(email).toLowerCase().trim();

    // ✅ FIX: passwordResetOtpHash is select:false in schema, so explicitly include it
    const user = await User.findOne({ email: lowerEmail }).select("+passwordResetOtpHash");
    if (!user) return res.status(400).json({ message: "Invalid OTP or expired" });

    if (!user.passwordResetOtpHash || !user.passwordResetOtpExpiresAt) {
      return res.status(400).json({ message: "OTP not found. Please request again." });
    }

    if (user.passwordResetOtpExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: "OTP expired. Please request again." });
    }

    if ((user.passwordResetOtpAttempts || 0) >= 5) {
      return res.status(429).json({ message: "Too many attempts. Please request a new OTP." });
    }

    const ok = await bcrypt.compare(String(otp), user.passwordResetOtpHash);
    if (!ok) {
      user.passwordResetOtpAttempts = (user.passwordResetOtpAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: "Invalid OTP" });
    }

    user.passwordHash = String(password); // pre-save will hash
    user.passwordResetOtpHash = null;
    user.passwordResetOtpExpiresAt = null;
    user.passwordResetOtpAttempts = 0;

    await user.save();
    return res.json({ success: true, message: "Password updated successfully. Please login." });
  } catch (err) {
    console.error("Reset password OTP error:", err);
    return res.status(500).json({ message: err.message || "Server error" });
  }
});

// ✅ ME
router.get("/me", authMiddleware, async (req, res) => {
  return res.json({ user: userResponse(req.user) });
});

module.exports = router;
