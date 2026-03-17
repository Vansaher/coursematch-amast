const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/matchController');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === 'application/pdf' || String(file.originalname || '').toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return cb(new Error('Only PDF uploads are supported'));
    }
    cb(null, true);
  },
});

router.post('/manual', controller.matchManualInput);
router.post('/stpm-upload', upload.single('resultFile'), controller.matchStpmPdfUpload);
// pass student id as parameter
router.get('/student/:studentId', controller.matchStudentToCourses);

module.exports = router;
