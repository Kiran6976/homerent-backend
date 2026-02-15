// utils/sendEmail.js
const { Resend } = require("resend");

if (!process.env.RESEND_API_KEY) {
  console.error("❌ RESEND_API_KEY missing");
}

const resend = new Resend(process.env.RESEND_API_KEY);

console.log("✅ Resend API initialized");

/* =========================
   SAFE SEND (never breaks API)
========================= */
async function safeSend({ to, subject, html, text }, label) {
  try {
    const fromEmail = process.env.FROM_EMAIL; // e.g. noreply@apnahome.site
    const fromName = process.env.FROM_NAME || "HomeRent";

    if (!fromEmail) {
      console.error("❌ FROM_EMAIL missing");
      return false;
    }

    await resend.emails.send({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject,
      html,
      text, // optional fallback
    });

    console.log(`✅ ${label} sent`);
    return true;
  } catch (err) {
    // Resend errors are usually in err.message; sometimes err.response
    console.error(`❌ ${label} failed`, err?.message || err);
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
      subject: "Your HomeRent OTP Code",
      html: `
        <div style="font-family: Arial; line-height: 1.6">
          <h2>Email Verification</h2>
          <p>Your OTP is:</p>
          <h1 style="letter-spacing: 6px">${otp}</h1>
          <p>This OTP expires in <b>10 minutes</b>.</p>
        </div>
      `,
      text: `HomeRent OTP: ${otp} (expires in 10 minutes)`,
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
      text: `HomeRent password reset OTP: ${otp} (expires in 10 minutes). If you didn't request this, ignore.`,
    },
    "RESET_PASSWORD_OTP_EMAIL"
  );
}

module.exports = {
  sendOtpEmail,
  sendResetPasswordOtpEmail,
};
