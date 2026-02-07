const nodemailer = require("nodemailer");

console.log("SMTP ENV CHECK:", {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
});

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

/* =========================
   OTP EMAIL (EXISTING)
========================= */
async function sendOtpEmail(to, otp) {
  await transporter.sendMail({
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
  });
}

/* =========================
   BOOKING EMAIL → TENANT
========================= */
async function sendBookingTenantEmail(tenant, booking, house) {
  await transporter.sendMail({
    from: `"HomeRent" <${process.env.SMTP_USER}>`,
    to: tenant.email,
    subject: "Booking Confirmed ✅ | HomeRent",
    html: `
      <div style="font-family: Arial; line-height: 1.6">
        <h2>Booking Confirmed 🎉</h2>

        <p>Hi <b>${tenant.name}</b>,</p>

        <p>Your booking payment has been successfully completed.</p>

        <hr />

        <p><b>Property:</b> ${house?.title || "N/A"}</p>
        <p><b>Location:</b> ${house?.location || "N/A"}</p>
        <p><b>Booking Amount:</b> ₹${booking.amount}</p>
        <p><b>Status:</b> <span style="color:green;">PAID</span></p>

        <hr />

        <p>
          The landlord has been notified and may contact you shortly.
        </p>

        <p style="margin-top:20px;">
          Thank you for using <b>HomeRent</b> 🏠
        </p>
      </div>
    `,
  });
}

/* =========================
   BOOKING EMAIL → LANDLORD
========================= */
async function sendBookingLandlordEmail(landlord, tenant, booking, house) {
  await transporter.sendMail({
    from: `"HomeRent" <${process.env.SMTP_USER}>`,
    to: landlord.email,
    subject: "You Received a Booking Payment 💰 | HomeRent",
    html: `
      <div style="font-family: Arial; line-height: 1.6">
        <h2>Booking Payment Received 💰</h2>

        <p>Hi <b>${landlord.name}</b>,</p>

        <p>
          You have received a booking payment for your property.
        </p>

        <hr />

        <p><b>Property:</b> ${house?.title || "N/A"}</p>
        <p><b>Location:</b> ${house?.location || "N/A"}</p>
        <p><b>Booking Amount:</b> ₹${booking.amount}</p>

        <h3>Tenant Details</h3>
        <p><b>Name:</b> ${tenant?.name || "N/A"}</p>
        <p><b>Email:</b> ${tenant?.email || "N/A"}</p>
        <p><b>Phone:</b> ${tenant?.phone || "N/A"}</p>

        <hr />

        <p>
          The tenant is now listed under your members section.
        </p>

        <p style="margin-top:20px;">
          Regards,<br/>
          <b>HomeRent Team</b>
        </p>
      </div>
    `,
  });
}

/* =========================
   EXPORTS
========================= */
module.exports = {
  sendOtpEmail,
  sendBookingTenantEmail,
  sendBookingLandlordEmail,
};
