// sendEmail.js
const nodemailer = require("nodemailer");

console.log("SMTP ENV CHECK:", {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  HAS_SMTP_PASS: !!process.env.SMTP_PASS,
});

/**
 * Gmail recommended:
 * SMTP_HOST = smtp.gmail.com
 * SMTP_PORT = 587 (secure=false)  OR  465 (secure=true)
 * SMTP_PASS must be a Gmail App Password (not your normal Gmail password)
 */

const SMTP_PORT = Number(process.env.SMTP_PORT || 587);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: SMTP_PORT,
  secure: SMTP_PORT === 465, // ✅ auto-handle 465 vs 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },

  // ✅ Fail fast instead of hanging forever
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,

  // ✅ Better logs in Render
  logger: true,
  debug: true,
});

// ✅ Verify SMTP at startup (helps debugging on Render)
transporter
  .verify()
  .then(() => console.log("✅ SMTP connected successfully"))
  .catch((err) => console.error("❌ SMTP verify failed:", err.message));

/* =========================
   INTERNAL SAFE SEND (won't crash API if mail fails)
========================= */
async function safeSendMail(mailOptions, label = "EMAIL") {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ ${label} sent:`, info.messageId || "(no messageId)");
    return info;
  } catch (err) {
    console.error(`❌ ${label} failed:`, err?.message || err);
    // IMPORTANT: Do NOT throw → prevents register/payment from failing
    return null;
  }
}

/* =========================
   OTP EMAIL
========================= */
async function sendOtpEmail(to, otp) {
  return safeSendMail(
    {
      from: `"HomeRent" <${process.env.SMTP_USER}>`,
      to,
      subject: "Your HomeRent OTP Code",
      html: `
        <div style="font-family: Arial; line-height: 1.6">
          <h2>Verify your email</h2>
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
   BOOKING EMAIL → TENANT
========================= */
async function sendBookingTenantEmail(tenant, booking, house) {
  return safeSendMail(
    {
      from: `"HomeRent" <${process.env.SMTP_USER}>`,
      to: tenant.email,
      subject: "Booking Confirmed ✅ | HomeRent",
      html: `
        <div style="font-family: Arial; line-height: 1.6">
          <h2>Booking Confirmed 🎉</h2>

          <p>Hi <b>${tenant?.name || "Tenant"}</b>,</p>

          <p>Your booking payment has been successfully completed.</p>

          <hr />

          <p><b>Property:</b> ${house?.title || "N/A"}</p>
          <p><b>Location:</b> ${house?.location || "N/A"}</p>
          <p><b>Booking Amount:</b> ₹${booking?.amount ?? "N/A"}</p>
          <p><b>Status:</b> <span style="color:green;">PAID</span></p>

          <hr />

          <p>The landlord has been notified and may contact you shortly.</p>

          <p style="margin-top:20px;">
            Thank you for using <b>HomeRent</b> 🏠
          </p>
        </div>
      `,
    },
    "BOOKING_TENANT_EMAIL"
  );
}

/* =========================
   BOOKING EMAIL → LANDLORD
========================= */
async function sendBookingLandlordEmail(landlord, tenant, booking, house) {
  return safeSendMail(
    {
      from: `"HomeRent" <${process.env.SMTP_USER}>`,
      to: landlord.email,
      subject: "You Received a Booking Payment 💰 | HomeRent",
      html: `
        <div style="font-family: Arial; line-height: 1.6">
          <h2>Booking Payment Received 💰</h2>

          <p>Hi <b>${landlord?.name || "Landlord"}</b>,</p>

          <p>You have received a booking payment for your property.</p>

          <hr />

          <p><b>Property:</b> ${house?.title || "N/A"}</p>
          <p><b>Location:</b> ${house?.location || "N/A"}</p>
          <p><b>Booking Amount:</b> ₹${booking?.amount ?? "N/A"}</p>

          <h3>Tenant Details</h3>
          <p><b>Name:</b> ${tenant?.name || "N/A"}</p>
          <p><b>Email:</b> ${tenant?.email || "N/A"}</p>
          <p><b>Phone:</b> ${tenant?.phone || "N/A"}</p>

          <hr />

          <p>The tenant is now listed under your members section.</p>

          <p style="margin-top:20px;">
            Regards,<br/>
            <b>HomeRent Team</b>
          </p>
        </div>
      `,
    },
    "BOOKING_LANDLORD_EMAIL"
  );
}

/* =========================
   EXPORTS
========================= */
module.exports = {
  sendOtpEmail,
  sendBookingTenantEmail,
  sendBookingLandlordEmail,
};
