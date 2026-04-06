const express = require('express');
const { requireAuth } = require('../middlewares/auth');
const { getProfile, updateProfile } = require('../controllers/profile.controller');

const router = express.Router();

router.get('/me', requireAuth, getProfile);
router.put('/me', requireAuth, updateProfile);

module.exports = router;
