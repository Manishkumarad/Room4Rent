const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  getListingImmersive,
  requestListingImmersive,
  updateListingImmersiveStatus
} = require('../controllers/immersive.controller');

const router = express.Router();

router.get('/listings/:listingId', getListingImmersive);
router.post('/listings/:listingId/generate', requireAuth, requireRole('landlord'), requestListingImmersive);
router.patch('/listings/:listingId/status', requireAuth, requireRole('admin'), updateListingImmersiveStatus);

module.exports = router;
