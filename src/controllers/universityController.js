const { Op } = require('sequelize');
const { University, Course } = require('../models');

exports.createUniversity = async (req, res) => {
  try {
    const university = await University.create(req.body);
    res.status(201).json(university);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getUniversities = async (req, res) => {
  try {
    const where = {};

    if (req.query.country) {
      where.country = req.query.country;
    }

    if (req.query.q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${req.query.q}%` } },
        { slug: { [Op.like]: `%${req.query.q}%` } },
        { city: { [Op.like]: `%${req.query.q}%` } },
        { state: { [Op.like]: `%${req.query.q}%` } },
      ];
    }

    const universities = await University.findAll({
      where,
      include: [{ model: Course, as: 'courses' }],
      order: [['name', 'ASC']],
    });

    res.json(universities);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUniversityById = async (req, res) => {
  try {
    const university = await University.findByPk(req.params.id, {
      include: [{ model: Course, as: 'courses' }],
    });

    if (!university) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json(university);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateUniversity = async (req, res) => {
  try {
    const [rows] = await University.update(req.body, {
      where: { id: req.params.id },
      returning: true,
    });

    if (rows === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const updated = await University.findByPk(req.params.id, {
      include: [{ model: Course, as: 'courses' }],
    });

    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteUniversity = async (req, res) => {
  try {
    const rows = await University.destroy({ where: { id: req.params.id } });

    if (rows === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
