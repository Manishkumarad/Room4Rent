const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsRoot = path.resolve(__dirname, '../../uploads/videos');
if (!fs.existsSync(uploadsRoot)) {
  fs.mkdirSync(uploadsRoot, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsRoot);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ext || '.mp4';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `listing-video-${unique}${safeExt}`);
  }
});

const allowedMimeTypes = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'video/ogg'
]);

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      const error = new Error('Unsupported video type. Use mp4, webm, mov, mkv, or ogg.');
      error.statusCode = 400;
      return cb(error);
    }

    return cb(null, true);
  }
});

function uploadSingleVideo(req, res, next) {
  upload.single('videoFile')(req, res, (error) => {
    if (error) {
      return next(error);
    }

    if (req.file) {
      const relativePath = `/uploads/videos/${req.file.filename}`;
      const host = req.get('host');
      const protocol = req.protocol;
      req.body.videoUrl = `${protocol}://${host}${relativePath}`;
    }

    if (req.body.sortOrder !== undefined) {
      req.body.sortOrder = Number(req.body.sortOrder);
    }

    if (req.body.isPrimary !== undefined) {
      req.body.isPrimary = String(req.body.isPrimary).toLowerCase() === 'true';
    }

    return next();
  });
}

module.exports = {
  uploadSingleVideo
};
