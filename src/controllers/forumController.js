const ForumPost = require('../models/ForumPost');
const Notification = require('../models/Notification');
const User = require('../models/User');

// ─── Posts ───────────────────────────────────────────────────────────────────

// POST /api/forum
exports.createPost = async (req, res) => {
  try {
    const { title, content, department, category, tags } = req.body;
    const post = await ForumPost.create({
      title,
      content,
      department: department || 'GENERAL',
      category: category || 'question',
      tags: tags ? tags.split(',').map(t => t.trim().toLowerCase()) : [],
      author: req.user._id,
    });

    await User.findByIdAndUpdate(req.user._id, { $inc: { forumPosts: 1 } });

    const populated = await post.populate('author', 'name role department studentId facultyId');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/forum
exports.getPosts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 15);
    const skip = (page - 1) * limit;

    const filter = { isActive: true };
    if (req.query.department) filter.department = req.query.department;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.resolved !== undefined) filter.isResolved = req.query.resolved === 'true';
    if (req.query.tags) filter.tags = { $in: req.query.tags.split(',').map(t => t.trim()) };
    if (req.query.search) filter.$text = { $search: req.query.search };

    const sortMap = {
      newest: { isPinned: -1, createdAt: -1 },
      oldest: { isPinned: -1, createdAt: 1 },
      popular: { isPinned: -1, views: -1 },
      votes: { isPinned: -1, upvotes: -1 },
    };
    const sort = sortMap[req.query.sortBy] || sortMap.newest;

    const [posts, total] = await Promise.all([
      ForumPost.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .populate('author', 'name role department studentId facultyId')
        .populate('verifiedBy', 'name role')
        .select('-replies') // replies excluded from list view
        .lean(),
      ForumPost.countDocuments(filter),
    ]);

    // Attach vote score
    const data = posts.map(p => ({
      ...p,
      voteScore: p.upvotes.length - p.downvotes.length,
      replyCount: 0, // replies not fetched here
    }));

    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/forum/:id
exports.getPost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id)
      .populate('author', 'name role department studentId facultyId profileImage')
      .populate('verifiedBy', 'name role')
      .populate('replies.author', 'name role department studentId facultyId profileImage')
      .populate('replies.replies.author', 'name role');

    if (!post || !post.isActive) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }

    // Increment views non-blocking
    ForumPost.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } }).exec();

    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/forum/:id
exports.updatePost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);
    if (!post || !post.isActive) return res.status(404).json({ success: false, message: 'Post not found' });

    if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const allowed = ['title', 'content', 'tags', 'category'];
    allowed.forEach(f => { if (req.body[f] !== undefined) post[f] = req.body[f]; });
    await post.save();

    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/forum/:id
exports.deletePost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);
    if (!post || !post.isActive) return res.status(404).json({ success: false, message: 'Post not found' });

    if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    post.isActive = false;
    await post.save();
    res.json({ success: true, message: 'Post deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Voting ──────────────────────────────────────────────────────────────────

// POST /api/forum/:id/vote
exports.votePost = async (req, res) => {
  try {
    const { type } = req.body; // 'up' | 'down'
    if (!['up', 'down'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Vote type must be up or down' });
    }

    const post = await ForumPost.findById(req.params.id);
    if (!post || !post.isActive) return res.status(404).json({ success: false, message: 'Post not found' });

    const uid = req.user._id;
    const upIdx = post.upvotes.findIndex((v) => v.equals(uid));
    const downIdx = post.downvotes.findIndex((v) => v.equals(uid));

    if (type === 'up') {
      if (upIdx > -1) post.upvotes.splice(upIdx, 1); // toggle off
      else {
        post.upvotes.push(uid);
        if (downIdx > -1) post.downvotes.splice(downIdx, 1);
        // Notify post author of the upvote (skip self-upvote)
        if (post.author && !post.author.equals(uid)) {
          Notification.createNotification({
            recipient: post.author,
            actor: uid,
            type: 'forum_upvote',
            title: 'Post Upvoted',
            message: `Someone upvoted your post "${post.title}"`,
            relatedPost: post._id,
          }).catch(() => {});
        }
      }
    } else {
      if (downIdx > -1) post.downvotes.splice(downIdx, 1);
      else {
        post.downvotes.push(uid);
        if (upIdx > -1) post.upvotes.splice(upIdx, 1);
      }
    }

    await post.save();
    res.json({
      success: true,
      data: { upvotes: post.upvotes.length, downvotes: post.downvotes.length, voteScore: post.upvotes.length - post.downvotes.length },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── Replies ─────────────────────────────────────────────────────────────────

// POST /api/forum/:id/replies
exports.addReply = async (req, res) => {
  try {
    const { content, parentReplyId } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'Content is required' });

    const post = await ForumPost.findById(req.params.id).populate('author', 'name');
    if (!post || !post.isActive) return res.status(404).json({ success: false, message: 'Post not found' });

    if (parentReplyId) {
      // Nested reply
      const parent = post.replies.id(parentReplyId);
      if (!parent) return res.status(404).json({ success: false, message: 'Parent reply not found' });
      parent.replies.push({ author: req.user._id, content });
    } else {
      post.replies.push({ author: req.user._id, content });
    }

    await post.save();
    await post.populate('replies.author', 'name role department studentId facultyId');

    // Notify post author if not self
    if (post.author._id.toString() !== req.user._id.toString()) {
      await Notification.createNotification({
        recipient: post.author._id,
        type: 'forum_reply',
        title: 'New Reply',
        message: `${req.user.name} replied to your post "${post.title}"`,
        relatedPost: post._id,
        actor: req.user._id,
      });
    }

    res.status(201).json({ success: true, data: post.replies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/forum/:id/replies/:replyId/vote
exports.voteReply = async (req, res) => {
  try {
    const { type } = req.body;
    if (!['up', 'down'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Vote type must be up or down' });
    }

    const post = await ForumPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const reply = post.replies.id(req.params.replyId);
    if (!reply || !reply.isActive) return res.status(404).json({ success: false, message: 'Reply not found' });

    const uid = req.user._id;
    const upIdx = reply.upvotes.findIndex((v) => v.equals(uid));
    const downIdx = reply.downvotes.findIndex((v) => v.equals(uid));

    if (type === 'up') {
      if (upIdx > -1) reply.upvotes.splice(upIdx, 1);
      else { reply.upvotes.push(uid); if (downIdx > -1) reply.downvotes.splice(downIdx, 1); }
    } else {
      if (downIdx > -1) reply.downvotes.splice(downIdx, 1);
      else { reply.downvotes.push(uid); if (upIdx > -1) reply.upvotes.splice(upIdx, 1); }
    }

    await post.save();
    res.json({ success: true, data: { upvotes: reply.upvotes.length, downvotes: reply.downvotes.length } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/forum/:id/replies/:replyId/accept  (post author only)
exports.acceptReply = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id).populate('replies.author', 'name');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the post author can accept answers' });
    }

    // Unaccept all, then accept target
    post.replies.forEach(r => { r.isAccepted = false; });
    const reply = post.replies.id(req.params.replyId);
    if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });

    reply.isAccepted = true;
    post.isResolved = true;
    await post.save();

    await Notification.createNotification({
      recipient: reply.author._id,
      type: 'reply_accepted',
      title: 'Answer Accepted',
      message: `Your answer on "${post.title}" was accepted!`,
      relatedPost: post._id,
      actor: req.user._id,
    });

    res.json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/forum/:id/verify  (faculty/admin only)
exports.verifyPost = async (req, res) => {
  try {
    const post = await ForumPost.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    post.isFacultyVerified = !post.isFacultyVerified;
    if (post.isFacultyVerified) {
      post.verifiedBy = req.user._id;
      post.verifiedAt = new Date();
    } else {
      post.verifiedBy = undefined;
      post.verifiedAt = undefined;
    }

    await post.save();
    res.json({ success: true, data: { isFacultyVerified: post.isFacultyVerified } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
