const { Op } = require('sequelize');
const { Course, University, CourseModule } = require('../models');
const { askCourseQuestion } = require('../services/qwenCourseCatalogAssistant');

const defaultInclude = [
  { model: University, as: 'university' },
  { model: CourseModule, as: 'modules' },
];

exports.createCourse = async (req, res) => {
  try {
    const course = await Course.create(req.body);
    const created = await Course.findByPk(course.id, { include: defaultInclude });
    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getCourses = async (req, res) => {
  try {
    const where = {};
    if (req.query.universityId) {
      where.universityId = req.query.universityId;
    }
    if (req.query.faculty) {
      where.faculty = { [Op.like]: `%${req.query.faculty}%` };
    }
    if (req.query.q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${req.query.q}%` } },
        { faculty: { [Op.like]: `%${req.query.q}%` } },
        { code: { [Op.like]: `%${req.query.q}%` } },
      ];
    }

    const courses = await Course.findAll({
      where,
      include: defaultInclude,
      order: [['name', 'ASC']],
    });
    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCourseById = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id, {
      include: defaultInclude,
    });
    if (!course) return res.status(404).json({ error: 'Not found' });
    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.askCourse = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id, {
      include: defaultInclude,
    });
    if (!course) return res.status(404).json({ error: 'Not found' });

    const question = String(req.body?.question || '').trim();
    if (!question) {
      return res.status(400).json({ error: 'Enter a question first' });
    }

    const answer = await askCourseQuestion(course.toJSON(), question);
    res.json(answer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const [rows] = await Course.update(req.body, {
      where: { id: req.params.id },
      returning: true,
    });
    if (rows === 0) return res.status(404).json({ error: 'Not found' });
    const updated = await Course.findByPk(req.params.id, {
      include: defaultInclude,
    });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    const rows = await Course.destroy({ where: { id: req.params.id } });
    if (rows === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
