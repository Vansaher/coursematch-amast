const express = require('express');
const controller = require('../controllers/userAccountController');
const { attachOptionalUser, requireUserApi } = require('../utils/userAuth');

const router = express.Router();

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/logout', attachOptionalUser, controller.logout);
router.get('/session', attachOptionalUser, controller.session);

router.get('/saved-courses', requireUserApi, controller.getSavedCourses);
router.post('/saved-courses', requireUserApi, controller.addSavedCourse);
router.delete('/saved-courses/:courseId', requireUserApi, controller.removeSavedCourse);

router.get('/comparisons', requireUserApi, controller.getComparisons);
router.post('/comparisons', requireUserApi, controller.createComparison);

router.get('/match-sessions', requireUserApi, controller.getMatchSessions);
router.post('/match-sessions', requireUserApi, controller.createMatchSession);

router.get('/planner', requireUserApi, controller.getPlannerItems);
router.post('/planner', requireUserApi, controller.createPlannerItem);
router.put('/planner/:id', requireUserApi, controller.updatePlannerItem);
router.delete('/planner/:id', requireUserApi, controller.deletePlannerItem);

router.get('/drafts/:courseId', requireUserApi, controller.getDraft);
router.put('/drafts/:courseId', requireUserApi, controller.upsertDraft);

router.get('/alerts', requireUserApi, controller.getAlerts);
router.post('/career-explorer', requireUserApi, controller.careerExplorer);

module.exports = router;
