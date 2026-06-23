const Resource = require('../models/Resource');
const Notification = require('../models/Notification');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');

// ─── Helpers ────────────────────────────────────────────────────────────────

const buildFilter = (query) => {
  const filter = { isActive: true };

  if (query.status) filter.approvalStatus = query.status;
  else filter.approvalStatus = 'approved'; // default: only approved

  if (query.department) filter.department = query.department;
  if (query.semester) filter.semester = Number(query.semester);
  if (query.category) filter.category = query.category;
  if (query.tags) filter.tags = { $in: query.tags.split(',').map(t => t.trim().toLowerCase()) };
  if (query.search) filter.$text = { $search: query.search };

  return filter;
};

const buildSort = (sortBy) => {
  const map = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    popular: { downloadsCount: -1 },
    rating: { averageRating: -1 },
    views: { viewsCount: -1 },
  };
  return map[sortBy] || map.newest;
};

// ─── Controllers ────────────────────────────────────────────────────────────

// POST /api/resources
exports.createResource = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'File is required' });

    const { title, description, subject, department, semester, category, tags } = req.body;

    const resource = await Resource.create({
      title,
      description,
      subject,
      department,
      semester: semester ? Number(semester) : undefined,
      category: category || 'other',
      tags: tags ? tags.split(',').map(t => t.trim().toLowerCase()) : [],
      fileUrl: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      uploadedBy: req.user._id,
    });

    // Update user upload count
    await User.findByIdAndUpdate(req.user._id, { $inc: { totalUploads: 1 } });

    res.status(201).json({ success: true, data: resource });
  } catch (err) {
    // Clean up file on error
    if (req.file) fs.unlink(req.file.path, () => {});
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/resources
exports.getResources = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 12);
    const skip = (page - 1) * limit;

    const filter = buildFilter(req.query);

    if (req.user) {
      if (['admin', 'faculty'].includes(req.user.role)) {
        // Admin/faculty see everything when no explicit status filter
        if (!req.query.status) delete filter.approvalStatus;
      } else if (!req.query.status) {
        // Students see approved resources + their own uploads (any status)
        delete filter.approvalStatus;
        filter.$or = [
          { approvalStatus: 'approved' },
          { uploadedBy: req.user._id },
        ];
      }
    }

    const sort = buildSort(req.query.sortBy);

    const [resources, total] = await Promise.all([
      Resource.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name role department studentId facultyId')
        .populate('approvedBy', 'name role')
        .lean(),
      Resource.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: resources,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/resources/:id
exports.getResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id)
      .populate('uploadedBy', 'name role department studentId facultyId profileImage')
      .populate('approvedBy', 'name role')
      .populate('ratings.user', 'name role');

    if (!resource || !resource.isActive) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }

    // Increment views (non-blocking)
    Resource.findByIdAndUpdate(req.params.id, { $inc: { viewsCount: 1 } }).exec();

    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/resources/:id
exports.updateResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource || !resource.isActive) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }

    // Only uploader or admin
    if (resource.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const allowed = ['title', 'description', 'subject', 'department', 'semester', 'category', 'tags'];
    allowed.forEach(field => {
      if (req.body[field] !== undefined) resource[field] = req.body[field];
    });

    // Reset to pending if non-admin edits
    if (req.user.role !== 'admin') resource.approvalStatus = 'pending';

    await resource.save();
    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/resources/:id
exports.deleteResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource || !resource.isActive) {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }

    if (resource.uploadedBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    resource.isActive = false;
    await resource.save();

    res.json({ success: true, message: 'Resource deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/resources/:id/approve  (admin/faculty)
exports.approveResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id).populate('uploadedBy', 'name email');
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

    resource.approvalStatus = 'approved';
    resource.approvedBy = req.user._id;
    resource.approvedAt = new Date();
    resource.rejectionReason = undefined;
    await resource.save();

    // Notify uploader
    await Notification.createNotification({
      recipient: resource.uploadedBy._id,
      type: 'resource_approved',
      title: 'Resource Approved',
      message: `Your resource "${resource.title}" has been approved.`,
      relatedResource: resource._id,
      actor: req.user._id,
    });

    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/resources/:id/reject  (admin/faculty)
exports.rejectResource = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Rejection reason required' });

    const resource = await Resource.findById(req.params.id).populate('uploadedBy', 'name');
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

    resource.approvalStatus = 'rejected';
    resource.rejectionReason = reason;
    resource.approvedBy = req.user._id;
    await resource.save();

    await Notification.createNotification({
      recipient: resource.uploadedBy._id,
      type: 'resource_rejected',
      title: 'Resource Rejected',
      message: `Your resource "${resource.title}" was rejected: ${reason}`,
      relatedResource: resource._id,
      actor: req.user._id,
    });

    res.json({ success: true, data: resource });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/resources/:id/download
exports.downloadResource = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource || !resource.isActive || resource.approvalStatus !== 'approved') {
      return res.status(404).json({ success: false, message: 'Resource not found' });
    }

    await Resource.findByIdAndUpdate(req.params.id, { $inc: { downloadsCount: 1 } });
    await User.findByIdAndUpdate(req.user._id, { $inc: { totalDownloads: 1 } });

    const filePath = path.join(__dirname, '../../', resource.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }

    res.download(filePath, resource.fileName);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/resources/:id/rate
exports.rateResource = async (req, res) => {
  try {
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be 1-5' });
    }

    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

    const existing = resource.ratings.find(r => r.user.toString() === req.user._id.toString());
    if (existing) {
      existing.rating = rating;
      existing.comment = comment;
    } else {
      resource.ratings.push({ user: req.user._id, rating, comment });
    }

    await resource.save(); // triggers averageRating recalc
    res.json({ success: true, data: { averageRating: resource.averageRating, totalRatings: resource.ratings.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/resources/:id/bookmark
exports.toggleBookmark = async (req, res) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

    const idx = resource.bookmarks.findIndex((b) => b.equals(req.user._id));
    const bookmarked = idx === -1;
    if (bookmarked) resource.bookmarks.push(req.user._id);
    else resource.bookmarks.splice(idx, 1);

    await resource.save();
    res.json({ success: true, bookmarked, bookmarkCount: resource.bookmarks.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/resources/my
exports.getMyResources = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 12);
    const skip = (page - 1) * limit;
    const filter = { uploadedBy: req.user._id, isActive: true };
    if (req.query.status) filter.approvalStatus = req.query.status;

    const [resources, total] = await Promise.all([
      Resource.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Resource.countDocuments(filter),
    ]);

    res.json({ success: true, data: resources, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/resources/analytics  (admin only)
exports.getAnalytics = async (req, res) => {
  try {
    const [overview, byDepartment, byCategory, topDownloaded, monthlyUploads] = await Promise.all([
      Resource.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            approved: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'approved'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'pending'] }, 1, 0] } },
            rejected: { $sum: { $cond: [{ $eq: ['$approvalStatus', 'rejected'] }, 1, 0] } },
            totalDownloads: { $sum: '$downloadsCount' },
            totalViews: { $sum: '$viewsCount' },
          },
        },
      ]),
      Resource.aggregate([
        { $match: { isActive: true, approvalStatus: 'approved' } },
        { $group: { _id: '$department', count: { $sum: 1 }, downloads: { $sum: '$downloadsCount' } } },
        { $sort: { count: -1 } },
      ]),
      Resource.aggregate([
        { $match: { isActive: true, approvalStatus: 'approved' } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Resource.find({ isActive: true, approvalStatus: 'approved' })
        .sort({ downloadsCount: -1 })
        .limit(10)
        .select('title downloadsCount viewsCount averageRating department')
        .lean(),
      Resource.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } },
        { $limit: 12 },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        overview: overview[0] || {},
        byDepartment,
        byCategory,
        topDownloaded,
        monthlyUploads: monthlyUploads.reverse(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/resources/pending  (admin/faculty)
exports.getPendingResources = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const filter = { isActive: true, approvalStatus: 'pending' };

    const [resources, total] = await Promise.all([
      Resource.find(filter)
        .sort({ createdAt: 1 }) // oldest first
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name role department studentId facultyId')
        .lean(),
      Resource.countDocuments(filter),
    ]);

    res.json({ success: true, data: resources, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/resources/bookmarks
exports.getBookmarks = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 12);
    const skip = (page - 1) * limit;
    const filter = { isActive: true, approvalStatus: 'approved', bookmarks: req.user._id };

    const [resources, total] = await Promise.all([
      Resource.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('uploadedBy', 'name role department')
        .lean(),
      Resource.countDocuments(filter),
    ]);

    res.json({ success: true, data: resources, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
