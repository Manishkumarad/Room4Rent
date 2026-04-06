const express = require('express');
const {
	register,
	login,
	refresh,
	logout,
	verifyEmail,
	resendVerification,
	requestOtp,
	verifyOtp
} = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.post('/request-phone-otp', requestOtp);
router.post('/verify-phone-otp', verifyOtp);

module.exports = router;
