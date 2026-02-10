// utils/sendEmail.js
const sgMail = require("@sendgrid/mail");

if (!process.env.SENDGRID_API_KEY) {
  console.error("❌ SENDGRID_API_KEY missing");
}

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
console.log("✅ SendGrid Web API initialized");

/* =========================
   SAFE SEND (never breaks API)
========================= */
async function safeSend(msg, label) {
  try {
    await sgMail.send(msg);
    console.log(`✅ ${label} sent`);
    return true;
  } catch (err) {
    console.error(`❌ ${label} failed`, err?.response?.body || err.message);
    return false;
  }
}

/* =========================
   OTP EMAIL
========================= */
async function sendOtpEmail(to, otp) {
  return safeSend(
    {
      to,
      from: {
        email: process.env.FROM_EMAIL,
        name: "HomeRent",
      },
      subject: "Your HomeRent OTP Code",
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
   RESET PASSWORD EMAIL
========================= */
async function sendResetPasswordEmail(to, resetLink) {
  return safeSend(
    {
      to,
      from: {
        email: process.env.FROM_EMAIL,
        name: "HomeRent",
      },
      subject: "Reset your HomeRent password",
      html: `
        <div style="font-family: Arial; line-height: 1.6">
          <h2>Password Reset</h2>
          <p>We received a request to reset your password.</p>
          <p>
            <a href="${resetLink}" style="display:inline-block;padding:10px 14px;background:#4f46e5;color:#fff;border-radius:8px;text-decoration:none">
              Reset Password
            </a>
          </p>
          <p>If the button doesn't work, copy and paste this link:</p>
          <p>${resetLink}</p>
          <p>This link expires in <b>15 minutes</b>.</p>
        </div>
      `,
    },
    "RESET_PASSWORD_EMAIL"
  );
}

module.exports = {
  sendOtpEmail,
  sendResetPasswordEmail,
};
