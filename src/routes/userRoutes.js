const express = require('express');
const router = express.Router();

const {
    getUsers,
    updateUserRole,
    toggleUserStatus,
    deleteUser
} = require('../controllers/userController');

const {
    protect,
    authorize
} = require('../middleware/authMiddleware');

// Protect all routes
router.use(protect);

// Only admins can access these routes
router.use(authorize('admin'));

// Get all users
// GET /api/admin/users
router.get('/', getUsers);

// Update user role
// PUT /api/admin/users/:id/role
router.put('/:id/role', updateUserRole);

// Activate / Suspend user
// PUT /api/admin/users/:id/toggle-status
router.put('/:id/toggle-status', toggleUserStatus);

// Delete user
// DELETE /api/admin/users/:id
router.delete('/:id', deleteUser);

module.exports = router;