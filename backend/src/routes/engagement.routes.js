const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  saveStudentListing,
  removeStudentSavedListing,
  getStudentSavedListings,
  createStudentInquiry,
  getMyStudentInquiries,
  getLandlordInquiries,
  patchLandlordInquiryStatus
} = require('../controllers/engagement.controller');

const router = express.Router();

router.post('/saved-listings/:listingId', requireAuth, requireRole('student'), saveStudentListing);
router.delete('/saved-listings/:listingId', requireAuth, requireRole('student'), removeStudentSavedListing);
router.get('/saved-listings', requireAuth, requireRole('student'), getStudentSavedListings);

router.post('/listings/:listingId/inquiries', requireAuth, requireRole('student'), createStudentInquiry);
router.get('/inquiries/me', requireAuth, requireRole('student'), getMyStudentInquiries);

router.get('/inquiries/received', requireAuth, requireRole('landlord'), getLandlordInquiries);
router.patch('/inquiries/:id/status', requireAuth, requireRole('landlord'), patchLandlordInquiryStatus);

module.exports = router;
