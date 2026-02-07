// sendEmail.js
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
   BOOKING EMAIL → TENANT
========================= */
async function sendBookingTenantEmail(tenant, booking, house) {
  return safeSend(
    {
      to: tenant.email,
      from: {
        email: process.env.FROM_EMAIL,
        name: "HomeRent",
      },
      subject: "Booking Confirmed ✅ | HomeRent",
      html: `
        <h2>Booking Confirmed 🎉</h2>
        <p>Hi <b>${tenant.name}</b>,</p>
        <p>Your payment of ₹${booking.amount} was successful.</p>
        <p><b>Property:</b> ${house.title}</p>
      `,
    },
    "BOOKING_TENANT_EMAIL"
  );
}

/* =========================
   BOOKING EMAIL → LANDLORD
========================= */
async function sendBookingLandlordEmail(landlord, tenant, booking, house) {
  return safeSend(
    {
      to: landlord.email,
      from: {
        email: process.env.FROM_EMAIL,
        name: "HomeRent",
      },
      subject: "You Received a Booking Payment 💰 | HomeRent",
      html: `
        <h2>Payment Received 💰</h2>
        <p><b>Amount:</b> ₹${booking.amount}</p>
        <p><b>Tenant:</b> ${tenant.name} (${tenant.email})</p>
      `,
    },
    "BOOKING_LANDLORD_EMAIL"
  );
}

module.exports = {
  sendOtpEmail,
  sendBookingTenantEmail,
  sendBookingLandlordEmail,
};
