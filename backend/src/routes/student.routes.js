const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  searchStudentListings,
  localityInsights,
  getRoommateProfile,
  upsertRoommateProfile,
  roommateMatches,
  createStudentSavedSearch,
  getStudentSavedSearches,
  updateStudentSavedSearch,
  deleteStudentSavedSearch,
  getStudentAlerts,
  markStudentAlertRead,
  markStudentAlertsReadAll,
  streamStudentAlerts
} = require('../controllers/student.controller');

const router = express.Router();

router.get('/listings/search', requireAuth, requireRole('student'), searchStudentListings);
router.get('/localities/insights', localityInsights);

router.post('/saved-searches', requireAuth, requireRole('student'), createStudentSavedSearch);
router.get('/saved-searches', requireAuth, requireRole('student'), getStudentSavedSearches);
router.put('/saved-searches/:id', requireAuth, requireRole('student'), updateStudentSavedSearch);
router.delete('/saved-searches/:id', requireAuth, requireRole('student'), deleteStudentSavedSearch);

router.get('/alerts', requireAuth, requireRole('student'), getStudentAlerts);
router.get('/alerts/stream', requireAuth, requireRole('student'), streamStudentAlerts);
router.patch('/alerts/:id/read', requireAuth, requireRole('student'), markStudentAlertRead);
router.patch('/alerts/read-all', requireAuth, requireRole('student'), markStudentAlertsReadAll);

router.get('/roommates/me', requireAuth, requireRole('student'), getRoommateProfile);
router.put('/roommates/me', requireAuth, requireRole('student'), upsertRoommateProfile);
router.get('/roommates/matches', requireAuth, requireRole('student'), roommateMatches);

module.exports = router;
