const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

const FROM = process.env.MAIL_FROM || `LUHub <${process.env.MAIL_USER}>`;
const CLIENT = process.env.CLIENT_URL || 'http://localhost:3000';

// ─── Templates ───────────────────────────────────────────────────────────────

const baseTemplate = (title, content) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#059669,#047857);padding:32px 40px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700;letter-spacing:-0.5px;">LUHub</h1>
            <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:13px;">Leading University Academic Portal</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="color:#1e293b;font-size:20px;margin:0 0 16px;">${title}</h2>
            ${content}
            <p style="color:#64748b;font-size:12px;margin:32px 0 0;padding-top:24px;border-top:1px solid #e2e8f0;">
              This email was sent by LUHub. If you did not request this, please ignore this email.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="color:#94a3b8;font-size:12px;margin:0;">© ${new Date().getFullYear()} LUHub · Leading University</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const btnStyle = 'display:inline-block;background:#059669;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:600;font-size:15px;margin:20px 0;';
const noteStyle = 'color:#64748b;font-size:13px;margin:12px 0 0;';

// ─── Email senders ────────────────────────────────────────────────────────────

exports.sendVerificationEmail = async (user, otp) => {
  const codeStyle =
    'display:inline-block;background:#ecfdf5;border:1px solid #a7f3d0;color:#047857;' +
    'font-size:34px;font-weight:700;letter-spacing:10px;padding:16px 28px;border-radius:12px;' +
    "font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;";
  const content = `
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hi <strong>${user.name}</strong>, welcome to LUHub! Use the verification code below to activate your account.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <span style="${codeStyle}">${otp}</span>
    </div>
    <p style="${noteStyle}">Enter this code on the verification screen to continue.</p>
    <p style="${noteStyle}">This code expires in <strong>10 minutes</strong>. If you did not request this, please ignore this email.</p>
  `;
  await transporter.sendMail({
    from: FROM,
    to: user.email,
    subject: `${otp} is your LUHub verification code`,
    html: baseTemplate('Verify Your Email', content),
  });
};

exports.sendPasswordResetEmail = async (user, token) => {
  const url = `${CLIENT}/reset-password?token=${token}`;
  const content = `
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hi <strong>${user.name}</strong>, we received a request to reset your password.
    </p>
    <div style="text-align:center;">
      <a href="${url}" style="${btnStyle}">Reset Password</a>
    </div>
    <p style="${noteStyle}">Or copy this link: <a href="${url}" style="color:#059669;">${url}</a></p>
    <p style="${noteStyle}">This link expires in <strong>1 hour</strong>. If you did not request this, ignore this email.</p>
  `;
  await transporter.sendMail({
    from: FROM,
    to: user.email,
    subject: 'Reset your LUHub password',
    html: baseTemplate('Reset Your Password', content),
  });
};

exports.sendWelcomeEmail = async (user) => {
  const content = `
    <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
      Hi <strong>${user.name}</strong>, your account is now verified and active!
    </p>
    <ul style="color:#475569;font-size:14px;line-height:2;padding-left:20px;">
      <li>Browse and download academic resources</li>
      <li>Upload your own study materials</li>
      <li>Ask questions in the Forum</li>
      <li>Collaborate with peers and faculty</li>
    </ul>
    <div style="text-align:center;">
      <a href="${CLIENT}/dashboard" style="${btnStyle}">Go to Dashboard</a>
    </div>
  `;
  await transporter.sendMail({
    from: FROM,
    to: user.email,
    subject: 'Welcome to LUHub!',
    html: baseTemplate('Welcome to LUHub! 🎉', content),
  });
};

// Notify a faculty applicant of an admin's approval decision
exports.sendFacultyApprovalEmail = async (user, status) => {
  const approved = status === 'approved';
  const content = approved
    ? `
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Hi <strong>${user.name}</strong>, your faculty account has been <strong>approved</strong> by an administrator.
        You can now sign in and access faculty features on LUHub.
      </p>
      <div style="text-align:center;">
        <a href="${CLIENT}/login" style="${btnStyle}">Sign In</a>
      </div>`
    : `
      <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px;">
        Hi <strong>${user.name}</strong>, we're sorry — your faculty account request was <strong>not approved</strong>.
      </p>
      <p style="${noteStyle}">
        If you believe this is a mistake, please contact the LUHub administrator.
      </p>`;
  await transporter.sendMail({
    from: FROM,
    to: user.email,
    subject: approved ? 'Your LUHub faculty account is approved' : 'Update on your LUHub faculty account',
    html: baseTemplate(approved ? 'Faculty Account Approved ✅' : 'Faculty Account Update', content),
  });
};

// Verify transporter (non-blocking, log only)
transporter.verify().then(() => {
  console.log('✉️  Mail service ready');
}).catch((err) => {
  console.warn('⚠️  Mail service not configured:', err.message);
});
