const express = require('express');
const router = express.Router();
const controller = require('../controllers/universityController');

router.post('/', controller.createUniversity);
router.get('/', controller.getUniversities);
router.get('/:id', controller.getUniversityById);
router.put('/:id', controller.updateUniversity);
router.delete('/:id', controller.deleteUniversity);

module.exports = router;
