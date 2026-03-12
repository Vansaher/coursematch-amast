const express = require('express');
const router = express.Router();
const controller = require('../controllers/matchController');

router.post('/manual', controller.matchManualInput);
// pass student id as parameter
router.get('/student/:studentId', controller.matchStudentToCourses);

module.exports = router;
