const { Student, Course, University, CourseModule } = require('../models');
const { deriveUniversityAbbreviation } = require('../utils/universityAbbreviation');
const {
  buildCourseAssessment,
  buildInterestAssessment,
  buildInterestProfile,
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

function scoreEntries(scores = {}) {
  return Object.entries(scores)
    .map(([subject, value]) => ({
      subject,
      canonical: canonicalSubject(subject),
      value: Number(value),
    }))
    .filter((entry) => Number.isFinite(entry.value));
}

function buildSubjectAlignment(scores = {}, subjectNames = []) {
  const studentScores = scoreEntries(scores);
  const targets = Array.isArray(subjectNames) ? subjectNames.filter(Boolean) : [];
  const matches = targets
    .map((subject) => findSubjectMatch(studentScores, subject))
    .filter(Boolean);
  const average = matches.length ? matches.reduce((sum, entry) => sum + entry.value, 0) / matches.length : null;
  const coverage = targets.length ? matches.length / targets.length : 0;

  return {
    matches,
    average,
    coverage,
  };
}

function buildSubjectFirstScore(scores = {}, subjectNames = [], fallbackScore = 50) {
  const alignment = buildSubjectAlignment(scores, subjectNames);
  if (!subjectNames.length) {
    return {
      score: Math.round(fallbackScore),
      alignment,
    };
  }

  const score = Math.round(
    Math.max(
      0,
      Math.min(100, alignment.coverage * 70 + (alignment.average === null ? 0 : alignment.average * 0.3))
    )
  );

  return {
    score,
    alignment,
  };
}

function summarizeText(value = '', maxLength = 160) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return null;
  }

  const sentence = text.match(/(.+?[.!?])(?:\s|$)/);
  const summary = sentence ? sentence[1] : text;
  return summary.length > maxLength ? `${summary.slice(0, maxLength - 1).trim()}…` : summary;
}

function buildSuitabilityNarrative(course, subjectNames = [], scores = {}) {
  const reasons = [];
  const subjectAlignment = buildSubjectAlignment(scores, subjectNames);

  if (subjectAlignment.matches.length) {
    reasons.push(
      `Your taken subjects align directly: ${subjectAlignment.matches
        .map((entry) => `${entry.subject} (${entry.value})`)
        .join(', ')}.`
    );
  }

  const requirementSummary = summarizeText(course.entryRequirements);
  if (requirementSummary) {
    reasons.push(`Entry requirements considered: ${requirementSummary}`);
  }

  const descriptionSummary = summarizeText(course.description);
  if (descriptionSummary) {
    reasons.push(`Course focus from the description: ${descriptionSummary}`);
  }

  return reasons;
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

function buildRequirementMatch(course, scores = {}, requirements = {}, interestAssessment = null) {
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
  const requiredSubjectNames = requiredSubjects.map((subject) => subject.name);
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

  const subjectFirst = buildSubjectFirstScore(
    scores,
    requiredSubjectNames,
    average !== null ? average : 50
  );
  let matchScore = subjectFirst.score;
  if (requirements.preferredFaculty) {
    matchScore += 5;
  }
  if (Array.isArray(requirements.preferredUniversityIds) && requirements.preferredUniversityIds.length) {
    matchScore += 5;
  }
  if (interestAssessment && interestAssessment.score !== null) {
    matchScore = Math.round(matchScore * 0.78 + interestAssessment.score * 0.22);
    reasons.push(...interestAssessment.reasons);
  }

  reasons.push(...buildSuitabilityNarrative(course, requiredSubjectNames, scores));

  return {
    ...course.toJSON(),
    matchScore: Math.min(100, matchScore),
    matchReasons: reasons,
    studentAverageScore: average,
    subjectPriorityScore: subjectFirst.score,
    matchMode: 'requirements',
  };
}

async function findMatches(scores = {}, requirements = {}) {
  const interestProfile = requirements.interestStatement
    ? await buildInterestProfile(requirements.interestStatement)
    : null;
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
    const interestAssessment = buildInterestAssessment(course, interestProfile);

    if (hasStructuredRequirements(course)) {
      const match = buildRequirementMatch(course, scores, requirements, interestAssessment);
      if (match) {
        if (interestProfile) {
          match.aiAssessment = {
            source: interestProfile.source,
            profileLabel: 'Interest profile',
            matchedSubjects: [],
            recommendedSubjects: interestProfile.preferredCourseAreas || [],
            model: interestProfile.model || null,
            interestSummary: interestProfile.summary,
          };
        }
        directMatches.push(match);
      }
      continue;
    }

    const heuristicAssessment = buildHeuristicAssessment(course, scores);
    softCandidates.push({
      course,
      filteredReasons,
      heuristicAssessment,
      interestAssessment,
      combinedPreRank: interestAssessment.score === null
        ? heuristicAssessment.score
        : Math.round(heuristicAssessment.score * 0.72 + interestAssessment.score * 0.28),
    });
  }

  const qwenLimit = isQwenConfigured() ? getQwenCandidateLimit() : 0;
  const rankedCandidates = [...softCandidates].sort(
    (a, b) => b.combinedPreRank - a.combinedPreRank || a.course.name.localeCompare(b.course.name)
  );
  const qwenCandidateIds = new Set(rankedCandidates.slice(0, qwenLimit).map((candidate) => String(candidate.course.id)));

  const softMatches = await Promise.all(
    rankedCandidates.map(async (candidate) => {
      const assessment = qwenCandidateIds.has(String(candidate.course.id))
        ? await buildCourseAssessment(candidate.course, scores, { interestProfile })
        : candidate.heuristicAssessment;

      if (!assessment.applicable) {
        return null;
      }

      const subjectPriorityScore = buildSubjectFirstScore(
        scores,
        assessment.recommendedSubjects && assessment.recommendedSubjects.length
          ? assessment.recommendedSubjects
          : assessment.matchedSubjects,
        assessment.score
      ).score;
      const matchScore = candidate.interestAssessment.score === null
        ? Math.round(subjectPriorityScore * 0.75 + assessment.score * 0.25)
        : Math.round(subjectPriorityScore * 0.58 + assessment.score * 0.24 + candidate.interestAssessment.score * 0.18);

      return {
        ...candidate.course.toJSON(),
        matchScore,
        matchReasons: [
          ...candidate.filteredReasons,
          ...assessment.reasons,
          ...candidate.interestAssessment.reasons,
          ...buildSuitabilityNarrative(
            candidate.course,
            assessment.recommendedSubjects && assessment.recommendedSubjects.length
              ? assessment.recommendedSubjects
              : assessment.matchedSubjects,
            scores
          ),
          ...(assessment.recommendedSubjects.length
            ? [`Recommended subjects: ${assessment.recommendedSubjects.join(', ')}`]
            : []),
        ],
        studentAverageScore: calculateAverage(scores),
        subjectPriorityScore,
        matchMode: assessment.source,
        aiAssessment: {
          source: assessment.source,
          profileLabel: assessment.profileLabel,
          matchedSubjects: assessment.matchedSubjects,
          recommendedSubjects: assessment.recommendedSubjects,
          model: assessment.model || null,
          interestSummary: interestProfile?.summary || null,
        },
      };
    })
  );

  return [...directMatches, ...softMatches.filter(Boolean)].sort(
    (a, b) =>
      (b.subjectPriorityScore || 0) - (a.subjectPriorityScore || 0) ||
      b.matchScore - a.matchScore ||
      a.name.localeCompare(b.name)
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
        interestStatement: resolvedRequirements.interestStatement || '',
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
        interestStatement: resolvedRequirements.interestStatement || '',
        averageScore: calculateAverage(parsed.scores),
      },
      matches,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
