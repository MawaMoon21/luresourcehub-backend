const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    required: true,
    enum: [
      'resource_approved',
      'resource_rejected',
      'resource_downloaded',
      'forum_reply',
      'forum_upvote',
      'reply_accepted',
      'faculty_verified',
    ],
  },
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 500 },
  relatedResource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource' },
  relatedPost: { type: mongoose.Schema.Types.ObjectId, ref: 'ForumPost' },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // who triggered this
  isRead: { type: Boolean, default: false },
}, {
  timestamps: true,
});

notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
// Auto-delete after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

notificationSchema.statics.createNotification = async function (data) {
  return this.create(data);
};

notificationSchema.statics.markAllRead = async function (userId) {
  return this.updateMany({ recipient: userId, isRead: false }, { isRead: true });
};

module.exports = mongoose.model('Notification', notificationSchema);
