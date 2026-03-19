const { Op } = require('sequelize');
const {
  UserAccount,
  UserSavedCourse,
  UserComparison,
  UserMatchSession,
  UserPlannerItem,
  UserCourseDraft,
  Course,
  University,
  CourseModule,
} = require('../models');
const {
  clearUserSession,
  clearUserSessionCookie,
  createUserSession,
  hashPassword,
  setUserSessionCookie,
  verifyPassword,
} = require('../utils/userAuth');
const { askCourseQuestion } = require('../services/qwenCourseCatalogAssistant');

const courseInclude = [
  { model: University, as: 'university' },
  { model: CourseModule, as: 'modules' },
];

function safeUser(user) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    preferences: user.preferences || {},
    lastLoginAt: user.lastLoginAt,
  };
}

exports.register = async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!username || !name || !email || !password) {
      return res.status(400).json({ error: 'Username, name, email, and password are required' });
    }

    const existing = await UserAccount.findOne({
      where: {
        [Op.or]: [{ email }, { username }],
      },
    });
    if (existing) {
      return res.status(409).json({
        error: existing.email === email ? 'Email is already registered' : 'Username is already taken',
      });
    }

    const { hash, salt } = hashPassword(password);
    const user = await UserAccount.create({
      username,
      name,
      email,
      passwordHash: hash,
      passwordSalt: salt,
      preferences: {
        notificationsEnabled: true,
        newMatchAlertsEnabled: true,
      },
      lastLoginAt: new Date(),
    });

    const token = createUserSession(user);
    setUserSessionCookie(res, token);
    res.status(201).json({ ok: true, user: safeUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await UserAccount.findOne({ where: { username } });
    if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = createUserSession(user);
    setUserSessionCookie(res, token);
    res.json({ ok: true, user: safeUser(user) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.logout = async (req, res) => {
  if (req.userSession) {
    clearUserSession(req.userSession.token);
  }
  clearUserSessionCookie(res);
  res.json({ ok: true });
};

exports.session = async (req, res) => {
  if (!req.userAccount) {
    return res.status(401).json({ error: 'Not logged in' });
  }

  res.json({ ok: true, user: safeUser(req.userAccount) });
};

exports.getSavedCourses = async (req, res) => {
  const items = await UserSavedCourse.findAll({
    where: { userId: req.userAccount.id },
    include: [{ model: Course, as: 'course', include: courseInclude }],
    order: [['created_at', 'DESC']],
  });
  res.json(items);
};

exports.addSavedCourse = async (req, res) => {
  const { courseId, notes } = req.body;
  const [item] = await UserSavedCourse.findOrCreate({
    where: {
      userId: req.userAccount.id,
      courseId,
    },
    defaults: {
      notes: notes || null,
    },
  });
  res.status(201).json(item);
};

exports.removeSavedCourse = async (req, res) => {
  await UserSavedCourse.destroy({
    where: {
      userId: req.userAccount.id,
      courseId: req.params.courseId,
    },
  });
  res.json({ ok: true });
};

exports.getComparisons = async (req, res) => {
  const rows = await UserComparison.findAll({
    where: { userId: req.userAccount.id },
    order: [['created_at', 'DESC']],
  });
  res.json(rows);
};

exports.createComparison = async (req, res) => {
  const { title, courseIds } = req.body;
  if (!Array.isArray(courseIds) || !courseIds.length) {
    return res.status(400).json({ error: 'Select courses first' });
  }

  const row = await UserComparison.create({
    userId: req.userAccount.id,
    title: title || `Comparison ${new Date().toLocaleString()}`,
    courseIds,
  });
  res.status(201).json(row);
};

exports.getMatchSessions = async (req, res) => {
  const rows = await UserMatchSession.findAll({
    where: { userId: req.userAccount.id },
    order: [['created_at', 'DESC']],
  });
  res.json(rows);
};

exports.createMatchSession = async (req, res) => {
  const { label, sessionType, inputSnapshot, resultsSnapshot } = req.body;
  const row = await UserMatchSession.create({
    userId: req.userAccount.id,
    label: label || `Match session ${new Date().toLocaleString()}`,
    sessionType: sessionType || 'match',
    inputSnapshot,
    resultsSnapshot,
  });
  res.status(201).json(row);
};

exports.getPlannerItems = async (req, res) => {
  const rows = await UserPlannerItem.findAll({
    where: { userId: req.userAccount.id },
    include: [{ model: Course, as: 'course', include: [{ model: University, as: 'university' }] }],
    order: [['due_date', 'ASC']],
  });
  res.json(rows);
};

exports.createPlannerItem = async (req, res) => {
  const row = await UserPlannerItem.create({
    userId: req.userAccount.id,
    courseId: req.body.courseId || null,
    title: req.body.title,
    details: req.body.details || null,
    dueDate: req.body.dueDate || null,
    status: req.body.status || 'planned',
  });
  res.status(201).json(row);
};

exports.updatePlannerItem = async (req, res) => {
  const row = await UserPlannerItem.findOne({
    where: { id: req.params.id, userId: req.userAccount.id },
  });
  if (!row) {
    return res.status(404).json({ error: 'Planner item not found' });
  }

  await row.update({
    title: req.body.title ?? row.title,
    details: req.body.details ?? row.details,
    dueDate: req.body.dueDate ?? row.dueDate,
    status: req.body.status ?? row.status,
  });
  res.json(row);
};

exports.deletePlannerItem = async (req, res) => {
  await UserPlannerItem.destroy({
    where: { id: req.params.id, userId: req.userAccount.id },
  });
  res.json({ ok: true });
};

exports.getDraft = async (req, res) => {
  const row = await UserCourseDraft.findOne({
    where: {
      userId: req.userAccount.id,
      courseId: req.params.courseId,
    },
  });
  res.json(row || { content: '' });
};

exports.getDrafts = async (req, res) => {
  const rows = await UserCourseDraft.findAll({
    where: { userId: req.userAccount.id },
    include: [{ model: Course, as: 'course', include: [{ model: University, as: 'university' }] }],
    order: [['updated_at', 'DESC']],
  });
  res.json(rows);
};

exports.upsertDraft = async (req, res) => {
  const [row] = await UserCourseDraft.findOrCreate({
    where: {
      userId: req.userAccount.id,
      courseId: req.params.courseId,
    },
    defaults: {
      content: req.body.content || '',
    },
  });

  if (row.content !== req.body.content) {
    row.content = req.body.content || '';
    await row.save();
  }

  res.json(row);
};

exports.getAlerts = async (req, res) => {
  const alerts = [];
  const preferences = req.userAccount.preferences || {};

  const plannerItems = await UserPlannerItem.findAll({
    where: {
      userId: req.userAccount.id,
      status: {
        [Op.ne]: 'done',
      },
      dueDate: {
        [Op.ne]: null,
      },
    },
    order: [['due_date', 'ASC']],
  });

  plannerItems.forEach((item) => {
    const dueDate = item.dueDate ? new Date(item.dueDate) : null;
    if (dueDate) {
      const diffDays = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 14) {
        alerts.push({
          type: 'planner_due',
          title: item.title,
          message: diffDays >= 0 ? `Due in ${diffDays} day(s)` : 'Past due',
        });
      }
    }
  });

  if (preferences.newMatchAlertsEnabled !== false) {
    const savedCourses = await UserSavedCourse.findAll({
      where: { userId: req.userAccount.id },
      include: [{ model: Course, as: 'course', include: [{ model: University, as: 'university' }] }],
      order: [['created_at', 'DESC']],
      limit: 5,
    });

    const savedUniversityIds = [...new Set(savedCourses.map((item) => item.course?.universityId).filter(Boolean))];
    if (savedUniversityIds.length) {
      const recentCourses = await Course.findAll({
        where: {
          universityId: { [Op.in]: savedUniversityIds },
          lastScrapedAt: {
            [Op.gte]: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30),
          },
        },
        include: [{ model: University, as: 'university' }],
        order: [['last_scraped_at', 'DESC']],
        limit: 5,
      });

      recentCourses.forEach((course) => {
        alerts.push({
          type: 'new_course_match',
          title: course.name,
          message: `Recently updated in ${course.university?.name || 'your saved university shortlist'}.`,
        });
      });
    }
  }

  res.json(alerts.slice(0, 12));
};

exports.careerExplorer = async (req, res) => {
  const interest = String(req.body.interest || '').trim();
  if (!interest) {
    return res.status(400).json({ error: 'Enter an interest statement first' });
  }

  const mockCourse = {
    name: 'Career direction explorer',
    university: { name: 'AMAST Match' },
    faculty: 'General',
    awardLevel: 'other',
    studyMode: 'flexible',
    durationText: null,
    intakeText: null,
    tuitionText: null,
    description: interest,
    entryRequirements: null,
    careerProspects: null,
    modules: [],
  };

  const answer = await askCourseQuestion(
    mockCourse,
    `Based on this interest statement, what course families or study directions should this student explore in Malaysia? ${interest}`
  );
  res.json(answer);
};
