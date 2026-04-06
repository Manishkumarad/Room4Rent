const { getMyProfile, updateMyProfile } = require('../services/profile.service');

async function getProfile(req, res, next) {
  try {
    const profile = await getMyProfile(req.auth.userId);

    if (!profile) {
      return res.status(404).json({ message: 'Profile not found.' });
    }

    return res.status(200).json(profile);
  } catch (error) {
    return next(error);
  }
}

async function updateProfile(req, res, next) {
  try {
    const profile = await updateMyProfile(req.auth.userId, req.body);
    return res.status(200).json({ message: 'Profile updated successfully.', profile });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getProfile,
  updateProfile
};
