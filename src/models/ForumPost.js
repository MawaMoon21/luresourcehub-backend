const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true, maxlength: 5000 },
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isAccepted: { type: Boolean, default: false },
  isFacultyVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  // One level of nested replies
  replies: [{
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 2000 },
    upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

const forumPostSchema = new mongoose.Schema({
  title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 300 },
  content: { type: String, required: [true, 'Content is required'], maxlength: 10000 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  department: {
    type: String,
    enum: ['CSE', 'EEE', 'BBA', 'MBA', 'LAW', 'ENG', 'PHARMACY', 'GENERAL'],
    default: 'GENERAL',
  },
  category: {
    type: String,
    enum: ['question', 'discussion', 'announcement', 'resource-request'],
    default: 'question',
  },
  tags: [{ type: String, trim: true, lowercase: true }],

  // Voting
  upvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  downvotes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  views: { type: Number, default: 0 },

  replies: [replySchema],

  // Faculty verification
  isFacultyVerified: { type: Boolean, default: false },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date },

  isResolved: { type: Boolean, default: false },
  isPinned: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

forumPostSchema.virtual('voteScore').get(function () {
  return this.upvotes.length - this.downvotes.length;
});

forumPostSchema.virtual('replyCount').get(function () {
  return this.replies.filter(r => r.isActive).length;
});

forumPostSchema.index({ department: 1, category: 1 });
forumPostSchema.index({ author: 1 });
forumPostSchema.index({ tags: 1 });
forumPostSchema.index({ isPinned: -1, createdAt: -1 });
forumPostSchema.index({ title: 'text', content: 'text', tags: 'text' });

module.exports = mongoose.model('ForumPost', forumPostSchema);
