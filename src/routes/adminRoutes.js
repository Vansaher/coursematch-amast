const express = require('express');
const router = express.Router();
const controller = require('../controllers/adminController');
const discoveryController = require('../controllers/discoveryController');

router.post('/imports', controller.runImport);
router.post('/discovery/run', discoveryController.runDiscovery);
router.get('/discovery/status', discoveryController.getDiscoveryStatus);
router.post('/discovery/course/:id', discoveryController.runDiscoveryForCourse);

module.exports = router;
