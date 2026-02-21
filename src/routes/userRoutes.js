const express = require('express');
const router = express.Router();
const { getUsers, updateUserRole, toggleUserStatus, deleteUser } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.use(authorize('admin', 'super_admin'));

router.get('/', getUsers);
router.put('/:id/role', updateUserRole);
router.put('/:id/toggle-status', toggleUserStatus);
router.delete('/:id', deleteUser);

module.exports = router;