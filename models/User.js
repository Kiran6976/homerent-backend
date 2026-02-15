// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },

    age: {
      type: Number,
      required: [true, "Age is required"],
      min: [18, "Must be at least 18 years old"],
    },

    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },

    passwordHash: {
      type: String,
      required: [true, "Password is required"],
    },

    role: {
      type: String,
      enum: ["tenant", "landlord", "admin"],
      required: true,
      default: "tenant",
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    phone: {
      type: String,
      trim: true,
    },

    // ✅ Landlord payout info
    upiId: {
      type: String,
      trim: true,
      default: null,
    },

    // ================================
    // ✅ Aadhaar (Landlords only)
    // ================================

    // Encrypted Aadhaar (AES-256-GCM)
    aadhaarEnc: {
      type: String,
      default: null,
      select: false,
    },

    // Last 4 digits for display
    aadhaarLast4: {
      type: String,
      default: null,
      trim: true,
    },

    // 🔐 Hash for uniqueness enforcement (landlords)
    aadhaarHash: {
      type: String,
      default: null,
      select: false,
      // ❌ DO NOT add index:true here, we add it via schema.index() below
    },

    aadhaarVerified: {
      type: Boolean,
      default: false,
      index: true,
    },

    aadhaarVerificationNote: {
      type: String,
      default: "",
      trim: true,
    },

    // ================================
    // OTP / Verification
    // ================================

    otpCodeHash: { type: String, default: null, select: false },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },

    // Password reset via OTP
    passwordResetOtpHash: { type: String, default: null, select: false },
    passwordResetOtpExpiresAt: { type: Date, default: null },
    passwordResetOtpAttempts: { type: Number, default: 0 },
  },
  { timestamps: true }
);

/**
 * ✅ PARTIAL UNIQUE INDEX
 * Unique ONLY when aadhaarHash is a string.
 * Tenants (null) will NOT conflict.
 */
userSchema.index(
  { aadhaarHash: 1 },
  {
    unique: true,
    partialFilterExpression: { aadhaarHash: { $type: "string" } },
  }
);

// ================================
// 🔒 Password Hash Middleware
// ================================
userSchema.pre("save", async function () {
  if (!this.isModified("passwordHash")) return;

  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

// ================================
// 🔐 Compare Password
// ================================
userSchema.methods.comparePassword = async function (plainPassword) {
  if (!plainPassword || !this.passwordHash) return false;
  return bcrypt.compare(plainPassword, this.passwordHash);
};

module.exports = mongoose.model("User", userSchema);
