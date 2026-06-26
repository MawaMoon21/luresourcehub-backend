const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  getUsers, getUser, updateUser, setApproval, deleteUser, getStats,
} = require('../controllers/adminController');

// All admin routes require an authenticated admin
router.use(protect, authorize('admin'));

router.get('/stats', getStats);
router.get('/users', getUsers);
router.get('/users/:id', getUser);
router.patch('/users/:id', updateUser);
router.patch('/users/:id/approval', setApproval);
router.delete('/users/:id', deleteUser);

module.exports = router;
