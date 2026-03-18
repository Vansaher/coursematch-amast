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

function normalizeSelectedCourseOperations(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return values
    .map((item) => {
      try {
        const parsed = typeof item === 'string' ? JSON.parse(item) : item;
        return parsed && parsed.id ? parsed : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

exports.runImport = async (req, res) => {
  try {
    const scraperKey = req.body.scraperKey || 'upm';
    const limit = req.body.limit;
    const sourceUrl = req.body.sourceUrl;
    const qwenEnrich = req.body.qwenEnrich;
    const normalizeCourseName = req.body.normalizeCourseName;
    const generalRequirementStpm = req.body.generalRequirementStpm;
    const generalRequirementMatriculation = req.body.generalRequirementMatriculation;
    const generalRequirementDiplomaEquivalent = req.body.generalRequirementDiplomaEquivalent;
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
      normalizeCourseName,
      generalRequirementStpm,
      generalRequirementMatriculation,
      generalRequirementDiplomaEquivalent,
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
    const normalizeCourseName = req.body.normalizeCourseName;
    const generalRequirementStpm = req.body.generalRequirementStpm;
    const generalRequirementMatriculation = req.body.generalRequirementMatriculation;
    const generalRequirementDiplomaEquivalent = req.body.generalRequirementDiplomaEquivalent;
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
        normalizeCourseName,
        generalRequirementStpm,
        generalRequirementMatriculation,
        generalRequirementDiplomaEquivalent,
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
    const normalizeCourseName = req.body.normalizeCourseName;
    const generalRequirementStpm = req.body.generalRequirementStpm;
    const generalRequirementMatriculation = req.body.generalRequirementMatriculation;
    const generalRequirementDiplomaEquivalent = req.body.generalRequirementDiplomaEquivalent;
    const selectedCourseSourceUrls = normalizeSelectedCourseSourceUrls(req.body.selectedCourseSourceUrls);
    const selectedCourseOperations = normalizeSelectedCourseOperations(req.body.selectedCourseOperations);
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
        normalizeCourseName,
        generalRequirementStpm,
        generalRequirementMatriculation,
        generalRequirementDiplomaEquivalent,
        sourceFile,
        selectedCourseSourceUrls,
        selectedCourseOperations,
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
