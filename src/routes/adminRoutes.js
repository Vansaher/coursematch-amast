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
router.post('/imports/preview', requireAdminApi, upload.single('sourceFile'), controller.previewImport);
router.post('/imports/apply', requireAdminApi, upload.single('sourceFile'), controller.applyImport);
router.get('/imports/jobs/:jobId', requireAdminApi, controller.getImportJob);

module.exports = router;
