const express = require('express');
const router = express.Router();
const controller = require('../controllers/courseController');

router.post('/', controller.createCourse);
router.get('/', controller.getCourses);
router.get('/:id', controller.getCourseById);
router.put('/:id', controller.updateCourse);
router.delete('/:id', controller.deleteCourse);

module.exports = router;