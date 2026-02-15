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
    const fromName = process.env.FROM_NAME || "ApnaHome";

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
   SHARED TEMPLATE HELPERS
========================= */
const BRAND = {
  name: "ApnaHome",
  // theme colors inspired by your UI (purple -> pink)
  gradA: "#5B5DFF",
  gradB: "#B623FF",
  gradC: "#FF4FD8",
  text: "#0F172A",
  muted: "#64748B",
  card: "#FFFFFF",
  bg: "#F6F4FF",
};

const wrapEmail = ({ title, subtitle, otp, otpLabel, tone = "verify" }) => {
  const year = new Date().getFullYear();

  const otpBg =
    tone === "reset"
      ? "linear-gradient(135deg, rgba(255,79,216,0.18), rgba(182,35,255,0.18))"
      : "linear-gradient(135deg, rgba(91,93,255,0.18), rgba(182,35,255,0.18))";

  const chipBg =
    tone === "reset"
      ? "rgba(255,79,216,0.12)"
      : "rgba(91,93,255,0.12)";

  const chipBorder =
    tone === "reset"
      ? "rgba(255,79,216,0.25)"
      : "rgba(91,93,255,0.25)";

  return `
  <div style="margin:0;padding:0;background:${BRAND.bg};font-family:Inter,Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};padding:34px 12px;">
      <tr>
        <td align="center">

          <!-- Outer container -->
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(17,24,39,0.10);">

            <!-- Header (gradient like your hero) -->
            <tr>
              <td style="
                padding:22px 22px;
                color:#fff;
                background: linear-gradient(135deg, ${BRAND.gradA} 0%, ${BRAND.gradB} 50%, ${BRAND.gradC} 100%);
              ">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                 <!-- Header -->
<tr>
  <td style="
    padding:28px 22px;
    background:#ffffff;
    border-bottom:1px solid rgba(148,163,184,0.25);
  ">

    <div style="
      font-size:26px;
      font-weight:900;
      letter-spacing:0.5px;
      background: linear-gradient(90deg, #5B5DFF 0%, #B623FF 50%, #FF4FD8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      color: transparent;
      display:inline-block;
    ">
      ApnaHome
    </div>

    <div style="
      font-size:13px;
      color:#64748B;
      margin-top:6px;
      font-weight:500;
    ">
      Smart & secure rental platform
    </div>

  </td>
</tr>

                </table>
              </td>
            </tr>

            <!-- Body background with subtle dot/grid feel (email-safe) -->
            <tr>
              <td style="
                background:
                  radial-gradient(circle at 10px 10px, rgba(91,93,255,0.10) 1px, transparent 1px),
                  radial-gradient(circle at 30px 30px, rgba(255,79,216,0.08) 1px, transparent 1px),
                  linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 100%);
                background-size: 40px 40px, 40px 40px, auto;
                padding: 28px 22px;
              ">

                <div style="font-size:20px;font-weight:900;color:${BRAND.text};margin:0 0 8px 0;">
                  ${title}
                </div>
                <div style="font-size:14px;color:${BRAND.muted};line-height:1.6;margin:0 0 18px 0;">
                  ${subtitle}
                </div>

                <!-- Chips row -->
                <div style="margin:0 0 18px 0;">
                  <span style="
                    display:inline-block;
                    font-size:12px;
                    padding:7px 10px;
                    border-radius:999px;
                    background:${chipBg};
                    border:1px solid ${chipBorder};
                    color:${BRAND.text};
                    margin-right:8px;
                  ">Verified owners</span>

                  <span style="
                    display:inline-block;
                    font-size:12px;
                    padding:7px 10px;
                    border-radius:999px;
                    background:${chipBg};
                    border:1px solid ${chipBorder};
                    color:${BRAND.text};
                  ">Secure booking flow</span>
                </div>

                <!-- OTP Card -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="
                  background:${BRAND.card};
                  border-radius:16px;
                  border:1px solid rgba(148,163,184,0.28);
                  box-shadow:0 8px 20px rgba(17,24,39,0.06);
                  overflow:hidden;
                ">
                  <tr>
                    <td style="padding:18px 18px 10px 18px;">
                      <div style="font-size:12px;color:${BRAND.muted};font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">
                        ${otpLabel}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 18px 18px 18px;">
                      <div style="
                        background:${otpBg};
                        border:1px solid rgba(91,93,255,0.20);
                        border-radius:14px;
                        padding:18px 14px;
                        text-align:center;
                      ">
                        <div style="
                          font-size:30px;
                          font-weight:900;
                          letter-spacing:10px;
                          color:${BRAND.text};
                          line-height:1.1;
                        ">${otp}</div>
                        <div style="font-size:12px;color:${BRAND.muted};margin-top:10px;">
                          Expires in <b>10 minutes</b>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>

                <!-- Note -->
                <div style="margin-top:16px;font-size:13px;color:${BRAND.muted};line-height:1.6;">
                  If you didn’t request this, you can safely ignore this email.
                </div>

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#FFFFFF;padding:18px 22px;border-top:1px solid rgba(148,163,184,0.25);">
                <div style="font-size:12px;color:${BRAND.muted};line-height:1.6;">
                  © ${year} ${BRAND.name}. All rights reserved.
                  <span style="margin:0 6px;opacity:0.5;">•</span>
                  This is an automated message.
                </div>
              </td>
            </tr>

          </table>

        </td>
      </tr>
    </table>
  </div>
  `;
};

/* =========================
   OTP EMAIL (Verification)
========================= */
async function sendOtpEmail(to, otp) {
  const html = wrapEmail({
    title: "Email Verification",
    subtitle: "Use the OTP below to verify your email address and complete your registration.",
    otp,
    otpLabel: "Your verification code",
    tone: "verify",
  });

  return safeSend(
    {
      to,
      subject: "ApnaHome • Verify your email",
      html,
      text: `ApnaHome - Email Verification OTP: ${otp} (expires in 10 minutes).`,
    },
    "OTP_EMAIL"
  );
}

/* =========================
   RESET PASSWORD OTP EMAIL
========================= */
async function sendResetPasswordOtpEmail(to, otp) {
  const html = wrapEmail({
    title: "Reset your password",
    subtitle: "Use the OTP below to reset your password. If this wasn’t you, ignore this email.",
    otp,
    otpLabel: "Your reset code",
    tone: "reset",
  });

  return safeSend(
    {
      to,
      subject: "ApnaHome • Password reset code",
      html,
      text: `ApnaHome - Password Reset OTP: ${otp} (expires in 10 minutes). If you didn't request this, ignore.`,
    },
    "RESET_PASSWORD_OTP_EMAIL"
  );
}

module.exports = {
  sendOtpEmail,
  sendResetPasswordOtpEmail,
};
