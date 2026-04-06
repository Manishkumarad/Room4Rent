const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  adminOverview,
  adminTrends,
  landlordMyDashboard,
  studentMyDashboard
} = require('../controllers/dashboard.controller');

const router = express.Router();

router.get('/admin/overview', requireAuth, requireRole('admin'), adminOverview);
router.get('/admin/trends', requireAuth, requireRole('admin'), adminTrends);
router.get('/landlord/me', requireAuth, requireRole('landlord'), landlordMyDashboard);
router.get('/student/me', requireAuth, requireRole('student'), studentMyDashboard);

module.exports = router;
