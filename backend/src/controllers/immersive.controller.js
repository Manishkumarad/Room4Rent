const {
  getImmersiveByListingId,
  requestGeneration,
  updateProcessingStatus
} = require('../services/immersive.service');

async function getListingImmersive(req, res, next) {
  try {
    const result = await getImmersiveByListingId(req.params.listingId);
    if (!result) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function requestListingImmersive(req, res, next) {
  try {
    const immersiveAsset = await requestGeneration(req.auth.userId, req.params.listingId, req.body);
    if (!immersiveAsset) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    return res.status(202).json({ message: 'Immersive generation requested.', immersiveAsset });
  } catch (error) {
    return next(error);
  }
}

async function updateListingImmersiveStatus(req, res, next) {
  try {
    const immersiveAsset = await updateProcessingStatus(req.auth.userId, req.params.listingId, req.body);
    if (!immersiveAsset) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    return res.status(200).json({ message: 'Immersive status updated successfully.', immersiveAsset });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getListingImmersive,
  requestListingImmersive,
  updateListingImmersiveStatus
};
