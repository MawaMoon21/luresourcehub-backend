const crypto = require('crypto');
const User = require('../models/User');
const { registerValidation, loginValidation } = require('../utils/validation');
const generateToken = require('../utils/generateToken');
const emailService = require('../utils/emailService');

const buildUserResponse = (user) => {
  const res = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    isVerified: user.isVerified,
    approvalStatus: user.approvalStatus,
    lastLogin: user.lastLogin,
    createdAt: user.createdAt,
  };
  if (user.role === 'student') { res.semester = user.semester; res.studentId = user.studentId; }
  if (user.role === 'faculty') { res.facultyId = user.facultyId; }
  return res;
};

// ─── Register ─────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { error } = registerValidation(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const exists = await User.findOne({ email: req.body.email });
    if (exists) return res.status(400).json({ success: false, message: 'Email already registered' });

    // SECURITY: never trust a client-supplied role beyond the two allowed public
    // roles. 'admin' is never self-assignable. Faculty accounts are created in a
    // 'pending' state and CANNOT log in until an administrator approves them —
    // this preserves the privilege-escalation guard while enabling self-signup.
    const requestedRole = req.body.role === 'faculty' ? 'faculty' : 'student';

    const userData = {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      role: requestedRole,
      department: req.body.department,
    };

    if (requestedRole === 'student') {
      if (!req.body.semester) return res.status(400).json({ success: false, message: 'Semester is required for students' });
      userData.semester = req.body.semester;
    } else {
      // Faculty must be reviewed and approved by an admin before first login.
      userData.approvalStatus = 'pending';
    }

    const user = await User.create(userData);

    // Generate a 6-digit verification OTP
    const otp = user.generateOtp();
    await user.save({ validateBeforeSave: false });

    // Send OTP email (non-blocking)
    emailService.sendVerificationEmail(user, otp).catch(err =>
      console.error('Verification email failed:', err.message)
    );

    res.status(201).json({
      success: true,
      message: requestedRole === 'faculty'
        ? 'Registration received! Verify your email with the 6-digit code, then an administrator will review and approve your faculty account before you can log in.'
        : 'Registration successful! Enter the 6-digit code we emailed you to verify your account.',
      requiresVerification: true,
      email: user.email,
      role: user.role,
      approvalStatus: user.approvalStatus,
    });
  } catch (err) {
    console.error('Register error:', err);
    if (err.code === 11000) return res.status(400).json({ success: false, message: 'Email already registered' });
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(', ') });
    }
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { error } = loginValidation(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });

    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password' });
    if (!user.isActive) return res.status(401).json({ success: false, message: 'Account is deactivated. Contact administrator.' });

    const match = await user.matchPassword(password);
    if (!match) return res.status(401).json({ success: false, message: 'Invalid email or password' });

    // Block unverified accounts
    if (!user.isVerified) {
      return res.status(403).json({
        success: false,
        message: 'Please verify your email before logging in.',
        requiresVerification: true,
        email: user.email,
      });
    }

    // Faculty accounts require admin approval before first login. Only explicit
    // pending/rejected states block login — legacy faculty (no approvalStatus)
    // are treated as already approved for backward compatibility.
    if (user.role === 'faculty' && ['pending', 'rejected'].includes(user.approvalStatus)) {
      return res.status(403).json({
        success: false,
        message: user.approvalStatus === 'pending'
          ? 'Your faculty account is awaiting administrator approval. You will be notified once it is approved.'
          : 'Your faculty account was not approved. Please contact the administrator.',
        approvalStatus: user.approvalStatus,
      });
    }

    await user.updateLastLogin();
    await user.save();

    const token = generateToken(user._id, user.role);
    res.json({ success: true, message: 'Login successful', token, user: buildUserResponse(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login' });
  }
};

// ─── Verify OTP ───────────────────────────────────────────────────────────────
const MAX_OTP_ATTEMPTS = 5;

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and verification code are required.' });
    }
    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({ success: false, message: 'Verification code must be 6 digits.' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code.' });
    }
    if (user.isVerified) {
      return res.status(400).json({ success: false, message: 'Account is already verified. Please log in.' });
    }
    if (!user.verificationToken || !user.verificationTokenExpires || user.verificationTokenExpires < Date.now()) {
      return res.status(400).json({ success: false, message: 'Verification code has expired. Please request a new one.' });
    }
    if (user.verificationAttempts >= MAX_OTP_ATTEMPTS) {
      // Invalidate the code after too many wrong tries — force a resend
      user.verificationToken = undefined;
      user.verificationTokenExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(429).json({ success: false, message: 'Too many incorrect attempts. Please request a new code.' });
    }

    const hashed = crypto.createHash('sha256').update(String(otp)).digest('hex');
    if (hashed !== user.verificationToken) {
      user.verificationAttempts += 1;
      await user.save({ validateBeforeSave: false });
      const remaining = MAX_OTP_ATTEMPTS - user.verificationAttempts;
      return res.status(400).json({
        success: false,
        message: remaining > 0
          ? `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Invalid verification code.',
      });
    }

    user.verifyEmail();
    await user.save({ validateBeforeSave: false });

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail(user).catch(() => {});

    const token = generateToken(user._id, user.role);
    res.json({ success: true, message: 'Email verified successfully! You can now log in.', token, user: buildUserResponse(user) });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ success: false, message: 'Server error during verification' });
  }
};

// ─── Resend Verification ──────────────────────────────────────────────────────
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'No account found with this email' });
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Account is already verified' });

    const otp = user.generateOtp();
    await user.save({ validateBeforeSave: false });

    await emailService.sendVerificationEmail(user, otp);
    res.json({ success: true, message: 'A new verification code has been sent. Please check your inbox.' });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ success: false, message: 'Failed to send verification email' });
  }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ email });
    // Always return success to prevent email enumeration
    if (!user) return res.json({ success: true, message: 'If this email is registered, a reset link has been sent.' });

    const rawToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    await emailService.sendPasswordResetEmail(user, rawToken);
    res.json({ success: true, message: 'Password reset link sent to your email.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, message: 'Failed to send reset email. Try again later.' });
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or has expired.' });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, message: 'Server error during password reset' });
  }
};

// ─── Get Me ───────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, user: buildUserResponse(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) { user.lastLogin = Date.now(); await user.save(); }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Update Profile ───────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { name, department, semester, phoneNumber } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (name) user.name = name;
    if (department) user.department = department;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (semester !== undefined && user.role === 'student') user.semester = semester;

    await user.save();
    res.json({ success: true, message: 'Profile updated successfully', user: buildUserResponse(user) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
