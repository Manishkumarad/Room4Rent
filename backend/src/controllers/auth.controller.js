const {
  registerUser,
  loginUser,
  refreshSession,
  logoutSession,
  resendEmailVerification,
  verifyEmailByToken,
  requestPhoneOtp,
  verifyPhoneOtp
} = require('../services/auth.service');

async function register(req, res, next) {
  try {
    const result = await registerUser(req.body, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip
    });
    return res.status(201).json({ message: 'User registered successfully.', ...result });
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await loginUser(req.body, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip
    });

    if (!result) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    if (result.blockedReason === 'email_not_verified') {
      let resend = null;
      try {
        const identifier = req.body?.identifier || result.user?.email || result.user?.phone;
        if (identifier) {
          resend = await resendEmailVerification({ identifier });
        }
      } catch {
        resend = null;
      }

      const verifyMessage = resend?.verificationEmailSent
        ? 'Please verify your email before logging in. We have sent a fresh verification email to your address.'
        : 'Please verify your email before logging in.';

      return res.status(403).json({
        message: verifyMessage,
        code: 'EMAIL_NOT_VERIFIED',
        verificationEmailSent: Boolean(resend?.verificationEmailSent),
        verificationDeliveryReason: resend?.verificationDeliveryReason,
        verificationUrl: resend?.verificationUrl
      });
    }

    return res.status(200).json({ message: 'Login successful.', ...result });
  } catch (error) {
    return next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const token = req.query?.token;
    const result = await verifyEmailByToken(token);

    if (!result?.ok) {
      return res.status(400).send(`<h2>${result?.message || 'Email verification failed.'}</h2>`);
    }

    return res.status(200).send('<h2>Email verified successfully. You can return to the app and log in.</h2>');
  } catch (error) {
    return next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const result = await refreshSession(req.body, {
      userAgent: req.get('user-agent'),
      ipAddress: req.ip
    });

    if (!result) {
      return res.status(401).json({ message: 'Invalid refresh token.' });
    }

    return res.status(200).json({ message: 'Session refreshed successfully.', ...result });
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res, next) {
  try {
    const result = await logoutSession(req.body);
    return res.status(200).json({ message: result.revoked ? 'Logged out successfully.' : 'Session already ended.' });
  } catch (error) {
    return next(error);
  }
}

async function requestOtp(req, res, next) {
  try {
    const result = await requestPhoneOtp(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const result = await verifyPhoneOtp(req.body);

    if (!result || !result.ok) {
      return res.status(400).json(result || { message: 'OTP verification failed.' });
    }

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function resendVerification(req, res, next) {
  try {
    const result = await resendEmailVerification(req.body || {});
    const statusCode = result?.accepted === false ? 400 : 200;
    return res.status(statusCode).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  verifyEmail,
  resendVerification,
  requestOtp,
  verifyOtp
};
