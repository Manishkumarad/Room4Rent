const {
  saveListing,
  unsaveListing,
  listSavedListings,
  createListingInquiry,
  listMyInquiries,
  listReceivedInquiries,
  updateInquiryStatus
} = require('../services/engagement.service');

async function saveStudentListing(req, res, next) {
  try {
    const result = await saveListing(req.auth.userId, req.params.listingId);
    if (!result) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    return res.status(result.saved ? 201 : 200).json({
      message: result.saved ? 'Listing saved successfully.' : 'Listing already saved.',
      item: result
    });
  } catch (error) {
    return next(error);
  }
}

async function removeStudentSavedListing(req, res, next) {
  try {
    const removed = await unsaveListing(req.auth.userId, req.params.listingId);
    if (!removed) {
      return res.status(404).json({ message: 'Saved listing not found.' });
    }

    return res.status(200).json({ message: 'Saved listing removed successfully.' });
  } catch (error) {
    return next(error);
  }
}

async function getStudentSavedListings(req, res, next) {
  try {
    const result = await listSavedListings(req.auth.userId, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function createStudentInquiry(req, res, next) {
  try {
    const inquiry = await createListingInquiry(req.auth.userId, req.params.listingId, req.body);
    if (!inquiry) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    return res.status(201).json({ message: 'Inquiry created successfully.', inquiry });
  } catch (error) {
    return next(error);
  }
}

async function getMyStudentInquiries(req, res, next) {
  try {
    const result = await listMyInquiries(req.auth.userId, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function getLandlordInquiries(req, res, next) {
  try {
    const result = await listReceivedInquiries(req.auth.userId, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function patchLandlordInquiryStatus(req, res, next) {
  try {
    const inquiry = await updateInquiryStatus(req.auth.userId, req.params.id, req.body);
    if (!inquiry) {
      return res.status(404).json({ message: 'Inquiry not found.' });
    }

    return res.status(200).json({ message: 'Inquiry status updated successfully.', inquiry });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  saveStudentListing,
  removeStudentSavedListing,
  getStudentSavedListings,
  createStudentInquiry,
  getMyStudentInquiries,
  getLandlordInquiries,
  patchLandlordInquiryStatus
};
