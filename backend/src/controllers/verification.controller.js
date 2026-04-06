const {
  submitLandlordDocument,
  listMyLandlordDocuments,
  listDocumentVerificationQueue,
  reviewLandlordDocument,
  submitListingForVerification,
  listListingVerificationQueue,
  reviewListingVerification
} = require('../services/verification.service');

async function uploadDocument(req, res, next) {
  try {
    const document = await submitLandlordDocument(req.auth.userId, req.body);
    return res.status(201).json({ message: 'Document submitted for verification.', document });
  } catch (error) {
    return next(error);
  }
}

async function myDocuments(req, res, next) {
  try {
    const result = await listMyLandlordDocuments(req.auth.userId);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function submitListing(req, res, next) {
  try {
    const result = await submitListingForVerification(req.auth.userId, req.params.id);
    if (!result) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    return res.status(200).json({ message: 'Listing submitted for verification.', listing: result });
  } catch (error) {
    return next(error);
  }
}

async function adminDocumentQueue(req, res, next) {
  try {
    const result = await listDocumentVerificationQueue(req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function adminReviewDocument(req, res, next) {
  try {
    const result = await reviewLandlordDocument(req.auth.userId, req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    return res.status(200).json({ message: 'Document reviewed successfully.', ...result });
  } catch (error) {
    return next(error);
  }
}

async function adminListingQueue(req, res, next) {
  try {
    const result = await listListingVerificationQueue(req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function adminReviewListing(req, res, next) {
  try {
    const result = await reviewListingVerification(req.auth.userId, req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Listing not found.' });
    }

    return res.status(200).json({ message: 'Listing verification reviewed successfully.', listing: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  uploadDocument,
  myDocuments,
  submitListing,
  adminDocumentQueue,
  adminReviewDocument,
  adminListingQueue,
  adminReviewListing
};
