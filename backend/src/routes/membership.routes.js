const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const {
  plans,
  myMembership,
  createCheckout,
  confirmCheckout,
  paymentWebhook
} = require('../controllers/membership.controller');

const router = express.Router();

router.get('/plans', plans);
router.get('/me', requireAuth, requireRole('landlord'), myMembership);
router.post('/checkout', requireAuth, requireRole('landlord'), createCheckout);
router.post('/checkout/confirm', requireAuth, requireRole('landlord'), confirmCheckout);
router.post('/webhooks/:provider', paymentWebhook);

module.exports = router;
