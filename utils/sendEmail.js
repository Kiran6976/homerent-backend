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
   OTP EMAIL (Verification)
========================= */
async function sendOtpEmail(to, otp) {
  return safeSend(
    {
      to,
      from: {
        email: process.env.FROM_EMAIL, // must be verified in SendGrid
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
   RESET PASSWORD OTP EMAIL
========================= */
async function sendResetPasswordOtpEmail(to, otp) {
  return safeSend(
    {
      to,
      from: {
        email: process.env.FROM_EMAIL,
        name: "HomeRent",
      },
      subject: "HomeRent Password Reset OTP",
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
