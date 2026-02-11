// utils/sendEmail.js
const nodemailer = require("nodemailer");

/* =========================
   ENV CONFIG
========================= */
const host = process.env.SMTP_HOST || "smtp.hostinger.com";
const port = Number(process.env.SMTP_PORT || 587); // 587 recommended
const secure =
  String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";

const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

if (!user || !pass) {
  console.error("❌ SMTP_USER or SMTP_PASS missing in .env");
}

/* =========================
   TRANSPORTER
========================= */
const transporter = nodemailer.createTransport({
  host,
  port,
  secure, // false for 587, true for 465
  auth: {
    user,
    pass,
  },
  tls: {
    rejectUnauthorized: false, // helps avoid SSL issues
  },
});

/* =========================
   VERIFY CONNECTION (IMPORTANT)
========================= */
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP VERIFY FAILED:", error.message);
  } else {
    console.log("✅ SMTP VERIFY SUCCESS — Server is ready to send emails");
  }
});

/* =========================
   SAFE SEND
========================= */
async function safeSend({ to, subject, html }, label) {
  try {
    const fromEmail = process.env.FROM_EMAIL || user;
    const fromName = process.env.FROM_NAME || "ApnaHome";

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
    });

    console.log(`✅ ${label} sent: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`❌ ${label} failed:`, err.message);
    return false;
  }
}

/* =========================
   OTP EMAIL (Verification)
========================= */
async function sendOtpEmail(to, otp) {
  return safeSend(
    {
      to,
      subject: "Your ApnaHome OTP Code",
      html: `
        <div style="font-family: Arial; line-height: 1.6">
          <h2>Email Verification</h2>
          <p>Your OTP is:</p>
          <h1 style="letter-spacing: 6px">${otp}</h1>
          <p>This OTP expires in <b>10 minutes</b>.</p>
        </div>
      `,
    },
    "OTP_EMAIL"
  );
}

/* =========================
   RESET PASSWORD OTP EMAIL
========================= */
async function sendResetPasswordOtpEmail(to, otp) {
  return safeSend(
    {
      to,
      subject: "ApnaHome Password Reset OTP",
      html: `
        <div style="font-family: Arial; line-height: 1.6">
          <h2>Password Reset</h2>
          <p>Your password reset OTP is:</p>
          <h1 style="letter-spacing: 6px">${otp}</h1>
          <p>This OTP expires in <b>10 minutes</b>.</p>
          <p>If you didn’t request this, ignore this email.</p>
        </div>
      `,
    },
    "RESET_PASSWORD_OTP_EMAIL"
  );
}

module.exports = {
  sendOtpEmail,
  sendResetPasswordOtpEmail,
};
