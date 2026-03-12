const { importUniversityCourses } = require('../services/importUniversityCourses');

exports.runImport = async (req, res) => {
  try {
    const scraperKey = req.body.scraperKey || 'upm';
    const limit = req.body.limit;
    const sourceUrl = req.body.sourceUrl;
    const sourceFile = req.file
      ? {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          path: req.file.path,
          size: req.file.size,
        }
      : null;
    const result = await importUniversityCourses(scraperKey, {
      limit,
      sourceUrl,
      sourceFile,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
