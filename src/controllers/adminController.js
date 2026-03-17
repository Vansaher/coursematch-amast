const { importUniversityCourses, previewUniversityCourses } = require('../services/importUniversityCourses');
const {
  createJob,
  getJob,
  serializeJob,
  startJob,
  updateJob,
} = require('../services/importJobStore');

function normalizeSelectedCourseSourceUrls(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
}

exports.runImport = async (req, res) => {
  try {
    const scraperKey = req.body.scraperKey || 'upm';
    const limit = req.body.limit;
    const sourceUrl = req.body.sourceUrl;
    const qwenEnrich = req.body.qwenEnrich;
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
      qwenEnrich,
      sourceFile,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.previewImport = async (req, res) => {
  try {
    const scraperKey = req.body.scraperKey || 'upm';
    const limit = req.body.limit;
    const sourceUrl = req.body.sourceUrl;
    const qwenEnrich = req.body.qwenEnrich;
    const sourceFile = req.file
      ? {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          path: req.file.path,
          size: req.file.size,
        }
      : null;
    const job = createJob('preview-import', {
      scraperKey,
      limit: limit || null,
      sourceUrl: sourceUrl || null,
    });
    startJob(job.id, async () =>
      previewUniversityCourses(scraperKey, {
        limit,
        sourceUrl,
        qwenEnrich,
        sourceFile,
        onProgress: (patch) => updateJob(job.id, patch),
      })
    );
    res.json({ jobId: job.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.applyImport = async (req, res) => {
  try {
    const scraperKey = req.body.scraperKey || 'upm';
    const limit = req.body.limit;
    const sourceUrl = req.body.sourceUrl;
    const qwenEnrich = req.body.qwenEnrich;
    const selectedCourseSourceUrls = normalizeSelectedCourseSourceUrls(req.body.selectedCourseSourceUrls);
    const sourceFile = req.file
      ? {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          path: req.file.path,
          size: req.file.size,
        }
      : null;
    const job = createJob('apply-import', {
      scraperKey,
      limit: limit || null,
      sourceUrl: sourceUrl || null,
      selectedCount: selectedCourseSourceUrls.length,
    });
    startJob(job.id, async () =>
      importUniversityCourses(scraperKey, {
        limit,
        sourceUrl,
        qwenEnrich,
        sourceFile,
        selectedCourseSourceUrls,
        onProgress: (patch) => updateJob(job.id, patch),
      })
    );
    res.json({ jobId: job.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getImportJob = async (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: 'Import job not found' });
  }

  res.json(serializeJob(job));
};
