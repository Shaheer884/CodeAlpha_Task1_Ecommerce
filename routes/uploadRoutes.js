const path = require('path');
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Configure disk storage
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/');
  },
  filename(req, file, cb) {
    cb(
      null,
      `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`
    );
  }
});

// Filter for image types
function checkFileType(file, cb) {
  const filetypes = /jpg|jpeg|png|webp/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, jpeg, png, webp) are allowed!'));
  }
}

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Max file size 5MB
  fileFilter: function (req, file, cb) {
    checkFileType(file, cb);
  }
});

// Single image upload route
router.post('/', protect, adminOnly, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  res.json({
    success: true,
    message: 'Image uploaded successfully',
    data: {
      url: `/uploads/${req.file.filename}`
    }
  });
});

// Multiple image upload route (for product image galleries)
router.post('/multiple', protect, adminOnly, upload.array('images', 5), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, message: 'No files uploaded' });
  }
  const urls = req.files.map(file => `/uploads/${file.filename}`);
  res.json({
    success: true,
    message: 'Images uploaded successfully',
    data: {
      urls
    }
  });
});

module.exports = router;
