const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  createPost,
  getPosts,
  getPost,
  updatePost,
  deletePost,
  votePost,
  addReply,
  voteReply,
  acceptReply,
  verifyPost,
} = require('../controllers/forumController');

router.use(protect);

router.get('/', getPosts);
router.post('/', createPost);
router.get('/:id', getPost);
router.put('/:id', updatePost);
router.delete('/:id', deletePost);

router.post('/:id/vote', votePost);
router.put('/:id/verify', authorize('faculty', 'admin'), verifyPost);

router.post('/:id/replies', addReply);
router.post('/:id/replies/:replyId/vote', voteReply);
router.put('/:id/replies/:replyId/accept', acceptReply);

module.exports = router;
