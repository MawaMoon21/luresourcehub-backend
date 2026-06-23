const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, maxlength: 500 },
}, { timestamps: true });

const resourceSchema = new mongoose.Schema({
  title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 200 },
  description: { type: String, maxlength: 2000 },
  subject: { type: String, required: [true, 'Subject is required'], trim: true },
  department: {
    type: String,
    required: [true, 'Department is required'],
    enum: ['CSE', 'EEE', 'BBA', 'MBA', 'LAW', 'ENG', 'PHARMACY'],
  },
  semester: { type: Number, min: 1, max: 12 },
  category: {
    type: String,
    required: true,
    enum: ['lecture-notes', 'assignment', 'past-paper', 'book', 'slides', 'lab-report', 'thesis', 'other'],
    default: 'other',
  },
  tags: [{ type: String, trim: true, lowercase: true }],

  // File info
  fileUrl: { type: String, required: true },
  fileName: { type: String, required: true },
  fileType: { type: String, required: true }, // mime type
  fileSize: { type: Number, required: true }, // bytes

  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Approval workflow
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectionReason: { type: String, maxlength: 500 },

  // Analytics
  viewsCount: { type: Number, default: 0 },
  downloadsCount: { type: Number, default: 0 },

  // Social
  ratings: [ratingSchema],
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  bookmarks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
resourceSchema.index({ department: 1, semester: 1 });
resourceSchema.index({ approvalStatus: 1, isActive: 1 });
resourceSchema.index({ uploadedBy: 1 });
resourceSchema.index({ tags: 1 });
resourceSchema.index({ downloadsCount: -1 });
resourceSchema.index({ createdAt: -1 });
resourceSchema.index({ title: 'text', description: 'text', subject: 'text', tags: 'text' });

// Recompute averageRating before save
resourceSchema.pre('save', function (next) {
  if (this.ratings.length > 0) {
    const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
    this.averageRating = +(sum / this.ratings.length).toFixed(1);
  }
  next();
});

module.exports = mongoose.model('Resource', resourceSchema);
