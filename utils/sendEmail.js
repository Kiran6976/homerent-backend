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
  gradA: "#5B5DFF",
  gradB: "#B623FF",
  gradC: "#FF4FD8",
  text: "#0F172A",
  muted: "#64748B",
  card: "#FFFFFF",
  bg: "#F6F4FF",
};

const formatINR = (n) => {
  const num = Number(n || 0);
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(num);
  } catch {
    return `₹${num}`;
  }
};

const fmtDateTime = (d) => {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return String(d);
  return dt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const renderRows = (rows = []) => {
  const safe = Array.isArray(rows) ? rows : [];
  return safe
    .filter((r) => r && r.label)
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px dashed rgba(148,163,184,0.35);">
          <div style="font-size:12px;color:${BRAND.muted};font-weight:800;letter-spacing:0.3px;text-transform:uppercase;">
            ${String(r.label)}
          </div>
          <div style="font-size:14px;color:${BRAND.text};font-weight:700;margin-top:4px;word-break:break-word;">
            ${r.value == null || r.value === "" ? "—" : String(r.value)}
          </div>
        </td>
      </tr>
    `
    )
    .join("");
};

const wrapNoticeEmail = ({ title, subtitle, badge, rows = [], footerNote = "" }) => {
  const year = new Date().getFullYear();

  return `
  <div style="margin:0;padding:0;background:${BRAND.bg};font-family:Inter,Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};padding:34px 12px;">
      <tr>
        <td align="center">

          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(17,24,39,0.10);background:#ffffff;">

            <!-- Header -->
            <tr>
              <td style="padding:22px 22px 16px 22px;background:#ffffff;border-bottom:1px solid rgba(148,163,184,0.25);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td>
                      <div style="
                        font-size:26px;
                        font-weight:900;
                        letter-spacing:0.4px;
                        background: linear-gradient(90deg, ${BRAND.gradA} 0%, ${BRAND.gradB} 50%, ${BRAND.gradC} 100%);
                        -webkit-background-clip: text;
                        -webkit-text-fill-color: transparent;
                        background-clip: text;
                        color: transparent;
                        display:inline-block;
                        line-height:1;
                      ">${BRAND.name}</div>

                      <div style="font-size:13px;color:${BRAND.muted};margin-top:6px;font-weight:600;">
                        Smart &amp; secure rental platform
                      </div>
                    </td>

                    ${
                      badge
                        ? `
                    <td align="right" style="vertical-align:top;">
                      <span style="
                        display:inline-block;
                        font-size:12px;
                        font-weight:900;
                        padding:8px 12px;
                        border-radius:999px;
                        color:${BRAND.text};
                        background: rgba(91,93,255,0.10);
                        border:1px solid rgba(91,93,255,0.22);
                        white-space:nowrap;
                      ">${badge}</span>
                    </td>`
                        : ""
                    }
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="
                background:
                  radial-gradient(circle at 10px 10px, rgba(91,93,255,0.10) 1px, transparent 1px),
                  radial-gradient(circle at 30px 30px, rgba(255,79,216,0.08) 1px, transparent 1px),
                  linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 100%);
                background-size: 40px 40px, 40px 40px, auto;
                padding: 26px 22px;
              ">

                <div style="font-size:20px;font-weight:900;color:${BRAND.text};margin:0 0 8px 0;">
                  ${title}
                </div>

                <div style="font-size:14px;color:${BRAND.muted};line-height:1.6;margin:0 0 18px 0;">
                  ${subtitle}
                </div>

                <!-- Details Card -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="
                  background:${BRAND.card};
                  border-radius:16px;
                  border:1px solid rgba(148,163,184,0.28);
                  box-shadow:0 8px 20px rgba(17,24,39,0.06);
                  overflow:hidden;
                ">
                  <tr>
                    <td style="padding:16px 18px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        ${renderRows(rows)}
                      </table>
                    </td>
                  </tr>
                </table>

                ${
                  footerNote
                    ? `
                <div style="margin-top:14px;font-size:13px;color:${BRAND.muted};line-height:1.6;">
                  ${footerNote}
                </div>`
                    : ""
                }

              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:#FFFFFF;padding:16px 22px;border-top:1px solid rgba(148,163,184,0.25);">
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
   OTP EMAILS
========================= */
const wrapEmail = ({ title, subtitle, otp, otpLabel, tone = "verify" }) => {
  const year = new Date().getFullYear();

  const otpBg =
    tone === "reset"
      ? "linear-gradient(135deg, rgba(255,79,216,0.18), rgba(182,35,255,0.18))"
      : "linear-gradient(135deg, rgba(91,93,255,0.18), rgba(182,35,255,0.18))";

  const chipBg = tone === "reset" ? "rgba(255,79,216,0.12)" : "rgba(91,93,255,0.12)";
  const chipBorder = tone === "reset" ? "rgba(255,79,216,0.25)" : "rgba(91,93,255,0.25)";

  return `
  <div style="margin:0;padding:0;background:${BRAND.bg};font-family:Inter,Arial,Helvetica,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${BRAND.bg};padding:34px 12px;">
      <tr>
        <td align="center">

          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(17,24,39,0.10);background:#ffffff;">

            <tr>
              <td style="padding:22px 22px 16px 22px;background:#ffffff;border-bottom:1px solid rgba(148,163,184,0.25);">
                <div style="
                  font-size:26px;
                  font-weight:900;
                  letter-spacing:0.4px;
                  background: linear-gradient(90deg, ${BRAND.gradA} 0%, ${BRAND.gradB} 50%, ${BRAND.gradC} 100%);
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                  background-clip: text;
                  color: transparent;
                  display:inline-block;
                  line-height:1;
                ">${BRAND.name}</div>

                <div style="font-size:13px;color:${BRAND.muted};margin-top:6px;font-weight:600;">
                  Smart &amp; secure rental platform
                </div>
              </td>
            </tr>

            <tr>
              <td style="
                background:
                  radial-gradient(circle at 10px 10px, rgba(91,93,255,0.10) 1px, transparent 1px),
                  radial-gradient(circle at 30px 30px, rgba(255,79,216,0.08) 1px, transparent 1px),
                  linear-gradient(180deg, #FFFFFF 0%, #FBFAFF 100%);
                background-size: 40px 40px, 40px 40px, auto;
                padding: 26px 22px;
              ">

                <div style="font-size:20px;font-weight:900;color:${BRAND.text};margin:0 0 8px 0;">
                  ${title}
                </div>
                <div style="font-size:14px;color:${BRAND.muted};line-height:1.6;margin:0 0 18px 0;">
                  ${subtitle}
                </div>

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
                    font-weight:700;
                  ">Verified owners</span>

                  <span style="
                    display:inline-block;
                    font-size:12px;
                    padding:7px 10px;
                    border-radius:999px;
                    background:${chipBg};
                    border:1px solid ${chipBorder};
                    color:${BRAND.text};
                    font-weight:700;
                  ">Secure booking flow</span>
                </div>

                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="
                  background:${BRAND.card};
                  border-radius:16px;
                  border:1px solid rgba(148,163,184,0.28);
                  box-shadow:0 8px 20px rgba(17,24,39,0.06);
                  overflow:hidden;
                ">
                  <tr>
                    <td style="padding:16px 18px 10px 18px;">
                      <div style="font-size:12px;color:${BRAND.muted};font-weight:800;letter-spacing:0.4px;text-transform:uppercase;">
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
                        <div style="font-size:12px;color:${BRAND.muted};margin-top:10px;font-weight:600;">
                          Expires in <b>10 minutes</b>
                        </div>
                      </div>
                    </td>
                  </tr>
                </table>

                <div style="margin-top:16px;font-size:13px;color:${BRAND.muted};line-height:1.6;">
                  If you didn’t request this, you can safely ignore this email.
                </div>

              </td>
            </tr>

            <tr>
              <td style="background:#FFFFFF;padding:16px 22px;border-top:1px solid rgba(148,163,184,0.25);">
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

/* =========================
   ✅ BOOKING PAYMENT SUBMITTED (Tenant)
========================= */
async function sendBookingPaymentSubmittedEmail(to, payload) {
  const { tenantName, bookingId, houseTitle, houseLocation, amount, utr, submittedAt } = payload || {};

  const html = wrapNoticeEmail({
    title: "Booking payment received",
    subtitle: `Hi ${tenantName || "there"}, we received your booking payment proof. Our team will verify it shortly.`,
    badge: "Booking",
    rows: [
      { label: "Booking ID", value: bookingId },
      { label: "Property", value: houseTitle || "—" },
      { label: "Location", value: houseLocation || "—" },
      { label: "Amount", value: formatINR(amount) },
      { label: "UTR", value: utr },
      { label: "Submitted at", value: fmtDateTime(submittedAt) },
      { label: "Status", value: "Payment proof submitted" },
    ],
    footerNote: "If you entered the wrong UTR, please contact support and submit the correct details.",
  });

  return safeSend(
    {
      to,
      subject: "ApnaHome • Booking payment received",
      html,
      text: `ApnaHome: Booking payment proof received. BookingId=${bookingId}, Amount=${formatINR(amount)}, UTR=${utr}.`,
    },
    "BOOKING_PAYMENT_SUBMITTED_EMAIL"
  );
}

/* =========================
   ✅ PAYOUT TRANSFERRED (Landlord)
========================= */
async function sendBookingPayoutTransferredEmail(to, payload) {
  const {
    landlordName,
    bookingId,
    houseTitle,
    houseLocation,
    amount,
    payoutUtr,
    payoutAt,
    tenantName,
    tenantEmail,
  } = payload || {};

  const html = wrapNoticeEmail({
    title: "Payout transferred to your UPI",
    subtitle: `Hi ${landlordName || "there"}, your booking payout has been transferred by ApnaHome.`,
    badge: "Payout",
    rows: [
      { label: "Booking ID", value: bookingId },
      { label: "Property", value: houseTitle || "—" },
      { label: "Location", value: houseLocation || "—" },
      { label: "Amount", value: formatINR(amount) },
      { label: "Payout UTR", value: payoutUtr },
      { label: "Transferred at", value: fmtDateTime(payoutAt) },
      { label: "Tenant", value: tenantName || "—" },
      { label: "Tenant email", value: tenantEmail || "—" },
      { label: "Status", value: "Transferred" },
    ],
    footerNote: "If you don’t see the amount in your bank yet, please allow some time for UPI settlement.",
  });

  return safeSend(
    {
      to,
      subject: "ApnaHome • Booking payout transferred",
      html,
      text: `ApnaHome: Payout transferred. BookingId=${bookingId}, Amount=${formatINR(amount)}, UTR=${payoutUtr}.`,
    },
    "BOOKING_PAYOUT_TRANSFERRED_EMAIL"
  );
}

/* =========================
   ✅ NEW: ADMIN ALERT when landlord submits house
========================= */
async function sendAdminHouseSubmittedEmail(to, payload) {
  const {
    houseId,
    title,
    location,
    rent,
    deposit,
    bookingAmount,
    type,
    beds,
    baths,
    furnished,
    landlordName,
    landlordEmail,
    landlordPhone,
    submittedAt,
  } = payload || {};

  const html = wrapNoticeEmail({
    title: "New house submitted for approval",
    subtitle: `A landlord has submitted a new house. Please review and approve/reject in the Admin panel.`,
    badge: "Admin",
    rows: [
      { label: "House ID", value: houseId },
      { label: "Title", value: title },
      { label: "Location", value: location },
      { label: "Rent", value: formatINR(rent) },
      { label: "Deposit", value: formatINR(deposit) },
      { label: "Booking amount", value: formatINR(bookingAmount) },
      { label: "Type", value: type || "—" },
      { label: "Beds / Baths", value: `${beds ?? "—"} / ${baths ?? "—"}` },
      { label: "Furnished", value: furnished ? "Yes" : "No" },
      { label: "Landlord", value: landlordName || "—" },
      { label: "Landlord email", value: landlordEmail || "—" },
      { label: "Landlord phone", value: landlordPhone || "—" },
      { label: "Submitted at", value: fmtDateTime(submittedAt) },
      { label: "Status", value: "Pending" },
    ],
    footerNote: "Tip: verify electricity bill & details before approving.",
  });

  return safeSend(
    {
      to,
      subject: "ApnaHome (Admin) • New house pending approval",
      html,
      text: `Admin alert: New house pending approval. HouseId=${houseId}, Title=${title}, Location=${location}.`,
    },
    "ADMIN_HOUSE_SUBMITTED_EMAIL"
  );
}

/* =========================
   ✅ NEW: LANDLORD email when admin APPROVES house
========================= */
async function sendHouseApprovedEmail(to, payload) {
  const { landlordName, houseId, title, location, approvedAt } = payload || {};

  const html = wrapNoticeEmail({
    title: "Your house has been approved ✅",
    subtitle: `Hi ${landlordName || "there"}, your house listing is approved and will be visible to tenants now.`,
    badge: "Approved",
    rows: [
      { label: "House ID", value: houseId },
      { label: "Title", value: title },
      { label: "Location", value: location },
      { label: "Approved at", value: fmtDateTime(approvedAt) },
      { label: "Status", value: "Approved" },
    ],
    footerNote: "You can now receive bookings from tenants.",
  });

  return safeSend(
    {
      to,
      subject: "ApnaHome • House approved",
      html,
      text: `Your house is approved. HouseId=${houseId}, Title=${title}.`,
    },
    "HOUSE_APPROVED_EMAIL"
  );
}

/* =========================
   ✅ NEW: LANDLORD email when admin REJECTS house
========================= */
async function sendHouseRejectedEmail(to, payload) {
  const { landlordName, houseId, title, location, rejectedAt, reason } = payload || {};

  const html = wrapNoticeEmail({
    title: "Your house was rejected ❌",
    subtitle: `Hi ${landlordName || "there"}, your house listing was rejected by admin. Please check the reason and re-upload with correct details.`,
    badge: "Rejected",
    rows: [
      { label: "House ID", value: houseId },
      { label: "Title", value: title },
      { label: "Location", value: location },
      { label: "Rejected at", value: fmtDateTime(rejectedAt) },
      { label: "Reason", value: reason || "Rejected by admin" },
      { label: "Status", value: "Rejected" },
    ],
    footerNote: "You can edit and submit again after fixing the issue.",
  });

  return safeSend(
    {
      to,
      subject: "ApnaHome • House rejected",
      html,
      text: `Your house was rejected. HouseId=${houseId}, Title=${title}, Reason=${reason || "Rejected by admin"}.`,
    },
    "HOUSE_REJECTED_EMAIL"
  );
}

module.exports = {
  sendOtpEmail,
  sendResetPasswordOtpEmail,

  // booking emails
  sendBookingPaymentSubmittedEmail,
  sendBookingPayoutTransferredEmail,

  // ✅ house/admin emails
  sendAdminHouseSubmittedEmail,
  sendHouseApprovedEmail,
  sendHouseRejectedEmail,
};
