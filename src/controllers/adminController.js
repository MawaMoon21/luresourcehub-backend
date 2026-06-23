const User = require('../models/User');
const emailService = require('../utils/emailService');

// Shape a user document for admin responses (never leak password/tokens)
const buildUserRecord = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department,
  isVerified: user.isVerified,
  isActive: user.isActive,
  approvalStatus: user.approvalStatus,
  studentId: user.studentId,
  facultyId: user.facultyId,
  semester: user.semester,
  createdAt: user.createdAt,
  lastLogin: user.lastLogin,
});

const VALID_ROLES = ['student', 'faculty', 'admin'];
const APPROVAL_STATUSES = ['pending', 'approved', 'rejected'];

// ─── GET /api/admin/users ───────────────────────────────────────────────────
// Paginated, searchable, role-filterable list of all users (admin only)
exports.getUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};

    // Role filter
    if (req.query.role && VALID_ROLES.includes(req.query.role)) {
      filter.role = req.query.role;
    }

    // Approval-status filter (used by the "Pending faculty" review queue)
    if (req.query.approvalStatus && APPROVAL_STATUSES.includes(req.query.approvalStatus)) {
      filter.approvalStatus = req.query.approvalStatus;
    }

    // Department filter (optional)
    if (req.query.department) {
      filter.department = req.query.department;
    }

    // Search by name or email (case-insensitive, escaped to avoid regex injection)
    if (req.query.search) {
      const escaped = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const term = new RegExp(escaped, 'i');
      filter.$or = [{ name: term }, { email: term }];
    }

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: users.map(buildUserRecord),
      pagination: {
        page,
        limit,
        total,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (err) {
    console.error('Admin getUsers error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

// ─── GET /api/admin/users/:id ─────────────────────────────────────────────────
exports.getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: buildUserRecord(user) });
  } catch (err) {
    console.error('Admin getUser error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
};

// ─── PATCH /api/admin/users/:id ───────────────────────────────────────────────
// Update role / active / verified status (admin only)
exports.updateUser = async (req, res) => {
  try {
    const { role, isActive, isVerified } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Prevent an admin from demoting / deactivating their own account by mistake
    if (String(user._id) === String(req.user.id) && (role && role !== 'admin' || isActive === false)) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role or status' });
    }

    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      user.role = role;
    }
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (typeof isVerified === 'boolean') user.isVerified = isVerified;

    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: 'User updated', data: buildUserRecord(user) });
  } catch (err) {
    console.error('Admin updateUser error:', err);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
};

// ─── PATCH /api/admin/users/:id/approval ──────────────────────────────────────
// Approve or reject a pending faculty registration (admin only).
// Approving activates the account; rejecting deactivates it.
exports.setApproval = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be either "approved" or "rejected"' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role !== 'faculty') {
      return res.status(400).json({ success: false, message: 'Only faculty accounts require approval' });
    }

    user.approvalStatus = status;
    user.isActive = status === 'approved';
    await user.save({ validateBeforeSave: false });

    // Notify the applicant (non-blocking)
    emailService.sendFacultyApprovalEmail(user, status).catch(err =>
      console.error('Faculty approval email failed:', err.message)
    );

    res.json({ success: true, message: `Faculty account ${status}`, data: buildUserRecord(user) });
  } catch (err) {
    console.error('Admin setApproval error:', err);
    res.status(500).json({ success: false, message: 'Failed to update approval status' });
  }
};

// ─── DELETE /api/admin/users/:id ──────────────────────────────────────────────
exports.deleteUser = async (req, res) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('Admin deleteUser error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────
// Aggregate counts for the admin dashboard
exports.getStats = async (req, res) => {
  try {
    const [total, byRole, verified, active, pendingFaculty] = await Promise.all([
      User.countDocuments(),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      User.countDocuments({ isVerified: true }),
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'faculty', approvalStatus: 'pending' }),
    ]);

    const roleCounts = byRole.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {});

    res.json({
      success: true,
      data: {
        totalUsers: total,
        verifiedUsers: verified,
        activeUsers: active,
        students: roleCounts.student || 0,
        faculty: roleCounts.faculty || 0,
        admins: roleCounts.admin || 0,
        pendingFaculty,
      },
    });
  } catch (err) {
    console.error('Admin getStats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};
