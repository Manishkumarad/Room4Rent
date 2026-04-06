const express = require('express');
const { requireAuth, requireRole } = require('../middlewares/auth');
const { uploadSingleVideo } = require('../middlewares/uploadMedia');
const {
  search,
  getOne,
  create,
  update,
  deactivate,
  addImage,
  addVideo,
  setAmenities,
  myListings
} = require('../controllers/listing.controller');

const router = express.Router();

router.get('/', search);
router.get('/me', requireAuth, requireRole('landlord'), myListings);
router.get('/:id', getOne);
router.post('/', requireAuth, requireRole('landlord'), create);
router.put('/:id', requireAuth, requireRole('landlord'), update);
router.delete('/:id', requireAuth, requireRole('landlord'), deactivate);
router.post('/:id/images', requireAuth, requireRole('landlord'), addImage);
router.post('/:id/videos', requireAuth, requireRole('landlord'), uploadSingleVideo, addVideo);
router.post('/:id/amenities', requireAuth, requireRole('landlord'), setAmenities);

module.exports = router;
