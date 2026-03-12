const {
  getDiscoveryStatus,
  runDiscoveryBatch,
  runDiscoveryForCourseId,
} = require('../services/serapiDiscovery');

exports.runDiscovery = async (req, res) => {
  try {
    const payload = await runDiscoveryBatch({
      scraperKey: req.body.scraperKey,
      universityId: req.body.universityId,
      courseId: req.body.courseId,
      limit: req.body.limit,
    });
    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getDiscoveryStatus = async (req, res) => {
  res.json(getDiscoveryStatus());
};

exports.runDiscoveryForCourse = async (req, res) => {
  try {
    const payload = await runDiscoveryForCourseId(req.params.id);
    res.json(payload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
