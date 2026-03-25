const { Op } = require('sequelize');
const { importUniversityCourses, previewUniversityCourses } = require('../services/importUniversityCourses');
const {
  University,
  Course,
  UserAccount,
  UserSavedCourse,
  UserMatchSession,
} = require('../models');
const {
  createJob,
  getJob,
  listJobs,
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

function hasContent(value) {
  return Boolean(String(value || '').trim());
}

function getInterestThemesFromSessions(sessions) {
  const themeDefinitions = [
    {
      label: 'Computing and technology',
      keywords: ['computer', 'tech', 'software', 'hardware', 'coding', 'ai', 'game', 'pc'],
    },
    {
      label: 'Business and management',
      keywords: ['business', 'management', 'marketing', 'finance', 'entrepreneur', 'account'],
    },
    {
      label: 'Creative and multimedia',
      keywords: ['design', 'multimedia', 'animation', 'creative', 'media', 'art', 'video'],
    },
    {
      label: 'Engineering and applied science',
      keywords: ['engineering', 'electrical', 'mechanical', 'civil', 'science', 'robotics'],
    },
    {
      label: 'Health and life sciences',
      keywords: ['health', 'medical', 'nursing', 'biology', 'pharmacy', 'nutrition'],
    },
  ];

  const counts = new Map();
  sessions.forEach((session) => {
    const interest = String(session.inputSnapshot?.interestNote || session.inputSnapshot?.interest || '').toLowerCase();
    if (!interest) {
      return;
    }

    let matched = false;
    themeDefinitions.forEach((theme) => {
      if (theme.keywords.some((keyword) => interest.includes(keyword))) {
        counts.set(theme.label, (counts.get(theme.label) || 0) + 1);
        matched = true;
      }
    });

    if (!matched) {
      counts.set('Other / mixed interests', (counts.get('Other / mixed interests') || 0) + 1);
    }
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}

exports.dashboard = async (req, res) => {
  const [
    universities,
    courses,
    totalUsers,
    totalSavedCourses,
    totalMatchRuns,
    whatIfRuns,
    savedCourseRows,
    recentSessions,
  ] = await Promise.all([
    University.findAll({ order: [['name', 'ASC']] }),
    Course.findAll({
      attributes: [
        'id',
        'name',
        'universityId',
        'faculty',
        'description',
        'entryRequirements',
        'intakeText',
        'tuitionText',
        'durationText',
        'lastScrapedAt',
      ],
      raw: true,
    }),
    UserAccount.count(),
    UserSavedCourse.count(),
    UserMatchSession.count(),
    UserMatchSession.count({ where: { sessionType: 'what_if' } }),
    UserSavedCourse.findAll({
      include: [
        {
          model: Course,
          as: 'course',
          attributes: ['id'],
          include: [{ model: University, as: 'university', attributes: ['id', 'name'] }],
        },
      ],
    }),
    UserMatchSession.findAll({
      attributes: ['inputSnapshot', 'sessionType'],
      order: [['created_at', 'DESC']],
      limit: 200,
    }),
  ]);

  const universityMap = new Map(universities.map((university) => [String(university.id), university]));
  const coverageMap = new Map(
    universities.map((university) => [
      String(university.id),
      {
        universityId: university.id,
        name: university.name,
        totalCourses: 0,
        latestUpdate: null,
        missingRequirements: 0,
        missingDescriptions: 0,
      },
    ])
  );

  let missingEntryRequirements = 0;
  let missingDescriptions = 0;
  let missingIntake = 0;
  let missingTuition = 0;
  let missingFaculty = 0;
  let missingDuration = 0;
  const duplicateBuckets = new Map();

  courses.forEach((course) => {
    if (!hasContent(course.entryRequirements)) {
      missingEntryRequirements += 1;
    }
    if (!hasContent(course.description)) {
      missingDescriptions += 1;
    }
    if (!hasContent(course.intakeText)) {
      missingIntake += 1;
    }
    if (!hasContent(course.tuitionText)) {
      missingTuition += 1;
    }
    if (!hasContent(course.faculty)) {
      missingFaculty += 1;
    }
    if (!hasContent(course.durationText)) {
      missingDuration += 1;
    }

    const duplicateKey = `${course.universityId || 'none'}::${String(course.name || '').trim().toLowerCase()}`;
    if (String(course.name || '').trim()) {
      duplicateBuckets.set(duplicateKey, (duplicateBuckets.get(duplicateKey) || 0) + 1);
    }

    const coverage = coverageMap.get(String(course.universityId));
    if (!coverage) {
      return;
    }

    coverage.totalCourses += 1;
    if (!hasContent(course.entryRequirements)) {
      coverage.missingRequirements += 1;
    }
    if (!hasContent(course.description)) {
      coverage.missingDescriptions += 1;
    }
    if (course.lastScrapedAt) {
      const scrapedAt = new Date(course.lastScrapedAt);
      if (!coverage.latestUpdate || scrapedAt > coverage.latestUpdate) {
        coverage.latestUpdate = scrapedAt;
      }
    }
  });

  const duplicateWarnings = [...duplicateBuckets.entries()]
    .filter(([, count]) => count > 1)
    .map(([key, count]) => {
      const [universityId, normalizedName] = key.split('::');
      return {
        universityName: universityMap.get(universityId)?.name || 'Unknown university',
        normalizedName,
        count,
      };
    })
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
    .map((item) => ({
      universityName: item.universityName,
      courseName: item.normalizedName
        .split(' ')
        .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : ''))
        .join(' '),
      count: item.count,
    }));

  const importJobs = listJobs().filter((job) => job.type === 'preview-import' || job.type === 'apply-import' || job.type === 'run-import');
  const lastImportJob = importJobs[0] || null;
  const recentFailedImports = importJobs.filter((job) => job.status === 'failed');
  const recentFailedUrlCount = importJobs.reduce((total, job) => total + Number(job.counters?.failedUrls || job.result?.failed?.length || 0), 0);

  const incompleteCourses = courses.filter(
    (course) =>
      !hasContent(course.entryRequirements) ||
      !hasContent(course.description) ||
      !hasContent(course.intakeText) ||
      !hasContent(course.tuitionText) ||
      !hasContent(course.durationText)
  ).length;

  const reviewQueue = [
    {
      title: 'Courses missing entry requirements',
      count: missingEntryRequirements,
      actionLabel: 'Open catalog',
      actionHref: '/admin/catalog',
    },
    {
      title: 'Potential duplicate course records',
      count: duplicateWarnings.reduce((total, item) => total + item.count - 1, 0),
      actionLabel: 'Review course catalog',
      actionHref: '/admin/catalog',
    },
    {
      title: 'Recent import parsing failures',
      count: recentFailedUrlCount,
      actionLabel: 'Open imports',
      actionHref: '/admin/imports',
    },
  ];

  const coverage = [...coverageMap.values()]
    .map((item) => ({
      ...item,
      latestUpdate: item.latestUpdate ? item.latestUpdate.toISOString() : null,
      staleDays: item.latestUpdate
        ? Math.max(0, Math.floor((Date.now() - item.latestUpdate.getTime()) / (1000 * 60 * 60 * 24)))
        : null,
    }))
    .sort((left, right) => right.totalCourses - left.totalCourses);

  const shortlistCounts = new Map();
  savedCourseRows.forEach((row) => {
    const name = row.course?.university?.name || 'Unknown university';
    shortlistCounts.set(name, (shortlistCounts.get(name) || 0) + 1);
  });

  const topShortlistedUniversities = [...shortlistCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);

  res.json({
    kpis: {
      universities: universities.length,
      totalCourses: courses.length,
      incompleteCourses,
      lastImportStatus: lastImportJob?.status || 'idle',
      lastImportLabel: lastImportJob
        ? `${lastImportJob.meta?.scraperKey?.toUpperCase() || 'Import'} ${lastImportJob.status}`
        : 'No import run in this server session',
      lastImportMessage: lastImportJob?.message || 'Run an import to populate current status',
      lastImportAt: lastImportJob?.finishedAt || lastImportJob?.updatedAt || null,
    },
    health: {
      missingCounts: {
        entryRequirements: missingEntryRequirements,
        descriptions: missingDescriptions,
        intake: missingIntake,
        tuition: missingTuition,
        faculty: missingFaculty,
        duration: missingDuration,
      },
      duplicateWarnings,
      parsingFailures: {
        failedJobs: recentFailedImports.length,
        failedUrls: recentFailedUrlCount,
        lastFailureMessage: recentFailedImports[0]?.error?.message || null,
      },
      reviewQueue,
    },
    coverage,
    analytics: {
      totalUsers,
      totalMatchRuns,
      whatIfRuns,
      totalSavedCourses,
      topShortlistedUniversities,
      interestThemes: getInterestThemesFromSessions(recentSessions),
    },
  });
};

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
