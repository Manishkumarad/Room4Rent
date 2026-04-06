const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { uploadDocument, myDocuments, submitListing } = require('../controllers/verification.controller');

const router = express.Router();

router.post('/documents', requireAuth, requireRole('landlord'), uploadDocument);
router.get('/documents/me', requireAuth, requireRole('landlord'), myDocuments);
router.post('/listings/:id/submit', requireAuth, requireRole('landlord'), submitListing);

module.exports = router;
