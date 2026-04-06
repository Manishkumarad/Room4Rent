const {
  createListing,
  listListings,
  getListingById,
  updateListing,
  deactivateListing,
  addListingImage,
  addListingVideo,
  setListingAmenities,
  listMyListings
} = require('../services/listing.service');

async function search(req, res, next) {
  try {
    const result = await listListings(req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function getOne(req, res, next) {
  try {
    const listing = await getListingById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found.' });
    }
    return res.status(200).json(listing);
  } catch (error) {
    return next(error);
  }
}

async function create(req, res, next) {
  try {
    const result = await createListing(req.auth.userId, req.body);
    return res.status(201).json({ message: 'Listing created successfully.', listing: result });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const result = await updateListing(req.auth.userId, req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Listing not found.' });
    }
    return res.status(200).json({ message: 'Listing updated successfully.', listing: result });
  } catch (error) {
    return next(error);
  }
}

async function deactivate(req, res, next) {
  try {
    const result = await deactivateListing(req.auth.userId, req.params.id);
    if (!result) {
      return res.status(404).json({ message: 'Listing not found.' });
    }
    return res.status(200).json({ message: 'Listing deactivated successfully.', listing: result });
  } catch (error) {
    return next(error);
  }
}

async function addImage(req, res, next) {
  try {
    const result = await addListingImage(req.auth.userId, req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Listing not found.' });
    }
    return res.status(200).json({ message: 'Listing image added successfully.', listing: result });
  } catch (error) {
    return next(error);
  }
}

async function setAmenities(req, res, next) {
  try {
    const result = await setListingAmenities(req.auth.userId, req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Listing not found.' });
    }
    return res.status(200).json({ message: 'Listing amenities updated successfully.', listing: result });
  } catch (error) {
    return next(error);
  }
}

async function addVideo(req, res, next) {
  try {
    const result = await addListingVideo(req.auth.userId, req.params.id, req.body);
    if (!result) {
      return res.status(404).json({ message: 'Listing not found.' });
    }
    return res.status(200).json({ message: 'Listing video added successfully.', listing: result });
  } catch (error) {
    return next(error);
  }
}

async function myListings(req, res, next) {
  try {
    const result = await listMyListings(req.auth.userId, req.query);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  search,
  getOne,
  create,
  update,
  deactivate,
  addImage,
  addVideo,
  setAmenities,
  myListings
};
