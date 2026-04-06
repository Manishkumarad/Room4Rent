const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  adminDocumentQueue,
  adminReviewDocument,
  adminListingQueue,
  adminReviewListing
} = require('../controllers/verification.controller');
const {
  adminAuditLogs,
  adminPaymentWebhookEvents,
  adminQueueHealth,
  adminWorkerHealth,
  adminDeadLetterJobs
} = require('../controllers/admin.controller');

const router = express.Router();

router.get('/verifications/documents', requireAuth, requireRole('admin'), adminDocumentQueue);
router.patch('/verifications/documents/:id', requireAuth, requireRole('admin'), adminReviewDocument);
router.get('/verifications/listings', requireAuth, requireRole('admin'), adminListingQueue);
router.patch('/verifications/listings/:id', requireAuth, requireRole('admin'), adminReviewListing);
router.get('/audit-logs', requireAuth, requireRole('admin'), adminAuditLogs);
router.get('/payments/webhooks', requireAuth, requireRole('admin'), adminPaymentWebhookEvents);
router.get('/ops/queues', requireAuth, requireRole('admin'), adminQueueHealth);
router.get('/ops/workers', requireAuth, requireRole('admin'), adminWorkerHealth);
router.get('/ops/dead-letters', requireAuth, requireRole('admin'), adminDeadLetterJobs);

module.exports = router;
