const { Student, Course, University, CourseModule } = require('../models');
const { deriveUniversityAbbreviation } = require('../utils/universityAbbreviation');
const {
  buildCourseAssessment,
  buildHeuristicAssessment,
  canonicalSubject,
  findSubjectMatch,
  getQwenCandidateLimit,
  isQwenConfigured,
} = require('../services/qwenCourseMatcher');
const { parseStpmPdfBuffer } = require('../services/stpmPdfParser');

function numericScores(scores = {}) {
  return Object.entries(scores)
    .map(([subject, value]) => ({
      subject,
      value: Number(value),
    }))
    .filter((entry) => Number.isFinite(entry.value));
}

function calculateAverage(scores = {}) {
  const numeric = numericScores(scores);
  if (!numeric.length) {
    return null;
  }

  return numeric.reduce((sum, entry) => sum + entry.value, 0) / numeric.length;
}

function hasStructuredRequirements(course) {
  const reqs = course.requirements || {};
  return Boolean(
    reqs &&
      ((Number.isFinite(Number(reqs.minAverage)) && reqs.minAverage !== null) ||
        (Array.isArray(reqs.subjects) && reqs.subjects.length))
  );
}

function parseRequiredSubjects(reqs = {}) {
  if (!Array.isArray(reqs.subjects)) {
    return [];
  }

  return reqs.subjects
    .map((item) => {
      if (typeof item === 'string') {
        return { name: item, minScore: null };
      }
      if (item && typeof item === 'object') {
        return {
          name: item.name || item.subject || item.title || '',
          minScore: Number.isFinite(Number(item.minScore)) ? Number(item.minScore) : null,
        };
      }
      return null;
    })
    .filter((item) => item && item.name);
}

function applyPreferenceFilters(course, requirements = {}) {
  const reasons = [];

  if (Array.isArray(requirements.preferredUniversityIds) && requirements.preferredUniversityIds.length) {
    const allowedIds = requirements.preferredUniversityIds.map((value) => String(value));
    if (!allowedIds.includes(String(course.universityId))) {
      return null;
    }
    reasons.push('Matches preferred university selection');
  }

  if (requirements.preferredFaculty) {
    const faculty = String(course.faculty || '').toLowerCase();
    const preferredFaculty = String(requirements.preferredFaculty).toLowerCase();
    if (!faculty.includes(preferredFaculty)) {
      return null;
    }
    reasons.push('Matches preferred faculty');
  }

  return reasons;
}

function buildRequirementMatch(course, scores = {}, requirements = {}) {
  const reasons = applyPreferenceFilters(course, requirements);
  if (!reasons) {
    return null;
  }

  const reqs = course.requirements || {};
  const average = calculateAverage(scores);

  if (reqs.minAverage && average !== null) {
    if (average < Number(reqs.minAverage)) {
      return null;
    }
    reasons.push(`Average score meets minimum ${reqs.minAverage}`);
  }

  const requiredSubjects = parseRequiredSubjects(reqs);
  if (requiredSubjects.length) {
    const matchedSubjects = [];
    const missingSubjects = [];

    for (const subject of requiredSubjects) {
      const matched = findSubjectMatch(
        Object.entries(scores).map(([name, value]) => ({
          subject: name,
          canonical: canonicalSubject(name),
          value: Number(value),
        })),
        subject.name
      );

      if (!matched) {
        missingSubjects.push(subject.name);
        continue;
      }

      if (subject.minScore !== null && matched.value < subject.minScore) {
        return null;
      }

      matchedSubjects.push(`${matched.subject}${subject.minScore !== null ? ` (${matched.value}/${subject.minScore})` : ''}`);
    }

    if (missingSubjects.length) {
      return null;
    }

    reasons.push(`Required subjects provided: ${matchedSubjects.join(', ')}`);
  }

  let matchScore = average !== null ? Math.round(average) : 50;
  if (requirements.preferredFaculty) {
    matchScore += 10;
  }
  if (Array.isArray(requirements.preferredUniversityIds) && requirements.preferredUniversityIds.length) {
    matchScore += 10;
  }

  return {
    ...course.toJSON(),
    matchScore,
    matchReasons: reasons,
    studentAverageScore: average,
    matchMode: 'requirements',
  };
}

async function findMatches(scores = {}, requirements = {}) {
  const courses = await Course.findAll({
    include: [
      { model: University, as: 'university' },
      { model: CourseModule, as: 'modules' },
    ],
  });

  const directMatches = [];
  const softCandidates = [];

  for (const course of courses) {
    const filteredReasons = applyPreferenceFilters(course, requirements);
    if (!filteredReasons) {
      continue;
    }

    if (hasStructuredRequirements(course)) {
      const match = buildRequirementMatch(course, scores, requirements);
      if (match) {
        directMatches.push(match);
      }
      continue;
    }

    const heuristicAssessment = buildHeuristicAssessment(course, scores);
    softCandidates.push({
      course,
      filteredReasons,
      heuristicAssessment,
    });
  }

  const qwenLimit = isQwenConfigured() ? getQwenCandidateLimit() : 0;
  const rankedCandidates = [...softCandidates].sort(
    (a, b) => b.heuristicAssessment.score - a.heuristicAssessment.score || a.course.name.localeCompare(b.course.name)
  );
  const qwenCandidateIds = new Set(rankedCandidates.slice(0, qwenLimit).map((candidate) => String(candidate.course.id)));

  const softMatches = await Promise.all(
    rankedCandidates.map(async (candidate) => {
      const assessment = qwenCandidateIds.has(String(candidate.course.id))
        ? await buildCourseAssessment(candidate.course, scores)
        : candidate.heuristicAssessment;

      if (!assessment.applicable) {
        return null;
      }

      return {
        ...candidate.course.toJSON(),
        matchScore: assessment.score,
        matchReasons: [
          ...candidate.filteredReasons,
          ...assessment.reasons,
          ...(assessment.recommendedSubjects.length
            ? [`Recommended subjects: ${assessment.recommendedSubjects.join(', ')}`]
            : []),
        ],
        studentAverageScore: calculateAverage(scores),
        matchMode: assessment.source,
        aiAssessment: {
          source: assessment.source,
          profileLabel: assessment.profileLabel,
          matchedSubjects: assessment.matchedSubjects,
          recommendedSubjects: assessment.recommendedSubjects,
          model: assessment.model || null,
        },
      };
    })
  );

  return [...directMatches, ...softMatches.filter(Boolean)].sort(
    (a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name)
  );
}

async function resolvePreferredUniversityIds(requirements = {}) {
  if (Array.isArray(requirements.preferredUniversityIds) && requirements.preferredUniversityIds.length) {
    return requirements;
  }

  const abbreviations = Array.isArray(requirements.preferredUniversities)
    ? requirements.preferredUniversities.map((value) => String(value).toUpperCase())
    : [];

  if (!abbreviations.length) {
    return requirements;
  }

  const universities = await University.findAll();
  const preferredUniversityIds = universities
    .filter((university) => abbreviations.includes(deriveUniversityAbbreviation(university)))
    .map((university) => university.id);

  return {
    ...requirements,
    preferredUniversityIds,
  };
}

// simple matching logic: compare student requirements/scores to course requirements
exports.matchStudentToCourses = async (req, res) => {
  try {
    const student = await Student.findByPk(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const resolvedRequirements = await resolvePreferredUniversityIds(student.requirements || {});
    const matches = await findMatches(student.scores || {}, resolvedRequirements);

    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.matchManualInput = async (req, res) => {
  try {
    const scores = req.body.scores || {};
    const requirements = req.body.requirements || {};
    const resolvedRequirements = await resolvePreferredUniversityIds(requirements);
    const matches = await findMatches(scores, resolvedRequirements);

    res.json({
      input: {
        scores,
        requirements: resolvedRequirements,
        averageScore: calculateAverage(scores),
      },
      matches,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.matchStpmPdfUpload = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Upload an STPM PDF file first' });
    }

    const requirements = req.body.requirements ? JSON.parse(req.body.requirements) : {};
    const parsed = await parseStpmPdfBuffer(req.file.buffer);
    const resolvedRequirements = await resolvePreferredUniversityIds(requirements);
    const matches = await findMatches(parsed.scores || {}, resolvedRequirements);

    res.json({
      input: {
        student: parsed.student,
        scores: parsed.scores,
        subjects: parsed.subjects,
        requirements: resolvedRequirements,
        averageScore: calculateAverage(parsed.scores),
      },
      matches,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
