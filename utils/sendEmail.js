// utils/sendEmail.js
const { Resend } = require("resend");

if (!process.env.RESEND_API_KEY) {
  console.error("❌ RESEND_API_KEY missing");
}

const resend = new Resend(process.env.RESEND_API_KEY);

console.log("✅ Resend API initialized");

/* =========================
   SAFE SEND (never crashes API)
========================= */
async function safeSend({ to, subject, html, text }, label) {
  try {
    const fromEmail = process.env.FROM_EMAIL;
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
      text,
    });

    console.log(`✅ ${label} sent`);
    return true;
  } catch (err) {
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
      subject: "Verify your HomeRent account",
      html: `
      <div style="background-color:#f4f6f8;padding:40px 0;font-family:Arial,Helvetica,sans-serif;">
        <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:20px;text-align:center;color:#ffffff;">
              <h1 style="margin:0;font-size:22px;">HomeRent</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:30px;">
              <h2 style="margin-top:0;color:#111827;">Email Verification</h2>
              <p style="color:#4b5563;font-size:15px;">
                Use the OTP below to verify your email address.
              </p>

              <!-- OTP Box -->
              <div style="
                margin:30px 0;
                text-align:center;
                background:#f3f4f6;
                padding:20px;
                border-radius:10px;
                font-size:30px;
                letter-spacing:8px;
                font-weight:bold;
                color:#111827;
              ">
                ${otp}
              </div>

              <p style="color:#6b7280;font-size:14px;">
                This OTP expires in <strong>10 minutes</strong>.
              </p>

              <p style="color:#6b7280;font-size:14px;">
                If you didn’t request this, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px;text-align:center;font-size:12px;color:#9ca3af;">
              © ${new Date().getFullYear()} HomeRent. All rights reserved.
            </td>
          </tr>

        </table>
      </div>
      `,
      text: `Your HomeRent OTP is: ${otp}. It expires in 10 minutes.`,
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
      subject: "HomeRent Password Reset",
      html: `
      <div style="background-color:#f4f6f8;padding:40px 0;font-family:Arial,Helvetica,sans-serif;">
        <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background:#111827;padding:20px;text-align:center;color:#ffffff;">
              <h1 style="margin:0;font-size:22px;">HomeRent</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:30px;">
              <h2 style="margin-top:0;color:#111827;">Password Reset</h2>
              <p style="color:#4b5563;font-size:15px;">
                Use the OTP below to reset your password.
              </p>

              <!-- OTP Box -->
              <div style="
                margin:30px 0;
                text-align:center;
                background:#fef3c7;
                padding:20px;
                border-radius:10px;
                font-size:30px;
                letter-spacing:8px;
                font-weight:bold;
                color:#111827;
              ">
                ${otp}
              </div>

              <p style="color:#6b7280;font-size:14px;">
                This OTP expires in <strong>10 minutes</strong>.
              </p>

              <p style="color:#6b7280;font-size:14px;">
                If you didn’t request this, please secure your account.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px;text-align:center;font-size:12px;color:#9ca3af;">
              © ${new Date().getFullYear()} HomeRent. All rights reserved.
            </td>
          </tr>

        </table>
      </div>
      `,
      text: `Your HomeRent password reset OTP is: ${otp}. It expires in 10 minutes.`,
    },
    "RESET_PASSWORD_OTP_EMAIL"
  );
}

module.exports = {
  sendOtpEmail,
  sendResetPasswordOtpEmail,
};
