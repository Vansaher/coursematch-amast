const express = require('express');
const router = express.Router();
const controller = require('../controllers/adminController');

router.post('/imports', controller.runImport);

module.exports = router;
