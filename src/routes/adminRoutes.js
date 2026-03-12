const express = require('express');
const multer = require('multer');
const router = express.Router();
const controller = require('../controllers/adminController');
const authController = require('../controllers/adminAuthController');
const { requireAdminApi } = require('../utils/adminAuth');
const upload = multer({ dest: 'uploads/' });

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/session', authController.session);
router.post('/imports', requireAdminApi, upload.single('sourceFile'), controller.runImport);

module.exports = router;
