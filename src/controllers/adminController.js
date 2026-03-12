const { importUniversityCourses } = require('../services/importUniversityCourses');

exports.runImport = async (req, res) => {
  try {
    const scraperKey = req.body.scraperKey || 'upm';
    const limit = req.body.limit;
    const result = await importUniversityCourses(scraperKey, { limit });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
