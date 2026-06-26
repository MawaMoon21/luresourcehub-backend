const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { upload } = require('../config/multerConfig');
const {
  createResource,
  getResources,
  getResource,
  updateResource,
  deleteResource,
  approveResource,
  rejectResource,
  downloadResource,
  rateResource,
  toggleBookmark,
  getMyResources,
  getBookmarks,
  getAnalytics,
  getPendingResources,
} = require('../controllers/resourceController');

// Public (auth optional — filter applied in controller)
router.get('/', protect, getResources);

// Authenticated
router.use(protect);

router.get('/my', getMyResources);
router.get('/bookmarks', getBookmarks);
router.get('/pending', authorize('admin', 'faculty'), getPendingResources);
router.get('/analytics', authorize('admin'), getAnalytics);
router.get('/:id', getResource);

router.post('/', upload.single('file'), createResource);
router.put('/:id', updateResource);
router.delete('/:id', deleteResource);

router.put('/:id/approve', authorize('admin', 'faculty'), approveResource);
router.put('/:id/reject', authorize('admin', 'faculty'), rejectResource);

router.post('/:id/download', downloadResource);
router.post('/:id/rate', rateResource);
router.put('/:id/bookmark', toggleBookmark);

module.exports = router;
