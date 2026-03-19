const express = require('express');
const router = express.Router();
const controller = require('../controllers/courseController');
const { requireAdminApi } = require('../utils/adminAuth');

router.post('/', requireAdminApi, controller.createCourse);
router.get('/', controller.getCourses);
router.post('/:id/ask', controller.askCourse);
router.get('/:id', controller.getCourseById);
router.put('/:id', requireAdminApi, controller.updateCourse);
router.delete('/:id', requireAdminApi, controller.deleteCourse);

module.exports = router;
