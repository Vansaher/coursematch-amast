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
  inferCourseProfile,
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

function detectSubjectGaps(course, scores = {}, suggestedSubjects = []) {
  const studentEntries = scoreEntries(scores);
  const gaps = [];
  const structuredSubjects = parseRequiredSubjects(course.requirements || {});

  if (structuredSubjects.length) {
    for (const subject of structuredSubjects) {
      const matched = findSubjectMatch(studentEntries, subject.name);
      if (!matched) {
        gaps.push({
          type: 'missing_required_subject',
          subject: subject.name,
          message: `Missing required subject: ${subject.name}.`,
        });
        continue;
      }

      if (subject.minScore !== null && matched.value < subject.minScore) {
        gaps.push({
          type: 'below_required_score',
          subject: matched.subject,
          currentScore: matched.value,
          requiredScore: subject.minScore,
          message: `${matched.subject} is below the preferred threshold (${matched.value}/${subject.minScore}).`,
        });
      }
    }

    return gaps;
  }

  const uniqueSuggestions = [...new Set((Array.isArray(suggestedSubjects) ? suggestedSubjects : []).filter(Boolean))];
  for (const subjectName of uniqueSuggestions) {
    const matched = findSubjectMatch(studentEntries, subjectName);
    if (!matched) {
      gaps.push({
        type: 'missing_recommended_subject',
        subject: subjectName,
        message: `Recommended subject not found: ${subjectName}.`,
      });
      continue;
    }

    if (matched.value < 60) {
      gaps.push({
        type: 'weak_recommended_subject',
        subject: matched.subject,
        currentScore: matched.value,
        message: `${matched.subject} is relevant but currently not a strong score (${matched.value}).`,
      });
    }
  }

  return gaps;
}

function buildAlternativeSuggestions(course, gaps = [], interestProfile = null) {
  const profile = inferCourseProfile(course);
  const suggestions = new Set();

  if (Array.isArray(profile?.relatedAlternatives)) {
    profile.relatedAlternatives.forEach((item) => suggestions.add(item));
  }

  if (Array.isArray(interestProfile?.preferredCourseAreas)) {
    interestProfile.preferredCourseAreas.forEach((item) => suggestions.add(item));
  }

  if (!suggestions.size && gaps.length) {
    suggestions.add('Related interdisciplinary programmes');
    suggestions.add('Broader degree options in the same faculty');
  }

  const normalizedCourseName = String(course.name || '').toLowerCase();
  return [...suggestions]
    .filter((item) => item && !normalizedCourseName.includes(String(item).toLowerCase()))
    .slice(0, 4);
}

function buildEligibility(matchScore, gapCount, hasRequirements) {
  if (hasRequirements && gapCount === 0 && matchScore >= 78) {
    return {
      label: 'Eligible',
      tone: 'eligible',
      summary: 'Your current scores look aligned with the course requirements.',
    };
  }

  if (matchScore >= 64) {
    return {
      label: 'Borderline',
      tone: 'borderline',
      summary: gapCount
        ? 'You have a realistic path here, but there are some academic gaps to review.'
        : 'This looks plausible, but you should still check course-specific details.',
    };
  }

  return {
    label: 'Explore Alternative',
    tone: 'explore',
    summary: 'This is more exploratory than direct. Related fields may fit better right now.',
  };
}

function buildConfidence(matchScore, subjectPriorityScore, matchMode, gapCount, hasRequirements) {
  const baseScore = Math.round(
    Math.max(
      20,
      Math.min(
        98,
        subjectPriorityScore * 0.45 +
          matchScore * 0.45 +
          (hasRequirements ? 12 : matchMode === 'qwen' ? 6 : 0) -
          gapCount * 7
      )
    )
  );

  if (baseScore >= 78) {
    return {
      label: 'High confidence',
      score: baseScore,
      summary: hasRequirements
        ? 'Strong subject alignment and clearer requirement evidence support this result.'
        : 'The result shows strong overall fit based on your scores and course profile.',
    };
  }

  if (baseScore >= 58) {
    return {
      label: 'Medium confidence',
      score: baseScore,
      summary: 'The result is promising, but some assumptions or weaker areas still affect certainty.',
    };
  }

  return {
    label: 'Low confidence',
    score: baseScore,
    summary: 'This recommendation is exploratory and should be treated as a starting point.',
  };
}

function buildExplanation(scoreFit = [], interestFit = [], preferenceFit = [], confidence, subjectGaps = [], alternatives = []) {
  return {
    scoreFit,
    interestFit,
    preferenceFit,
    confidence,
    subjectGaps,
    alternativeSuggestions: alternatives,
  };
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

function buildRequirementMatch(course, scores = {}, requirements = {}, interestAssessment = null, interestProfile = null) {
  const preferenceReasons = applyPreferenceFilters(course, requirements);
  if (!preferenceReasons) {
    return null;
  }
  const reasons = [...preferenceReasons];
  const scoreReasons = [];
  const interestReasons = interestAssessment?.reasons || [];

  const reqs = course.requirements || {};
  const average = calculateAverage(scores);

  if (reqs.minAverage && average !== null) {
    if (average < Number(reqs.minAverage)) {
      return null;
    }
    const averageReason = `Average score meets minimum ${reqs.minAverage}`;
    reasons.push(averageReason);
    scoreReasons.push(averageReason);
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

    const subjectReason = `Required subjects provided: ${matchedSubjects.join(', ')}`;
    reasons.push(subjectReason);
    scoreReasons.push(subjectReason);
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
    reasons.push(...interestReasons);
  }

  const narrativeReasons = buildSuitabilityNarrative(course, requiredSubjectNames, scores);
  reasons.push(...narrativeReasons);
  scoreReasons.push(...narrativeReasons);
  const subjectGaps = detectSubjectGaps(course, scores, requiredSubjectNames);
  const eligibility = buildEligibility(matchScore, subjectGaps.length, true);
  const confidence = buildConfidence(matchScore, subjectFirst.score, 'requirements', subjectGaps.length, true);
  const alternatives = buildAlternativeSuggestions(course, subjectGaps, interestProfile);

  return {
    ...course.toJSON(),
    matchScore: Math.min(100, matchScore),
    matchReasons: reasons,
    studentAverageScore: average,
    subjectPriorityScore: subjectFirst.score,
    matchMode: 'requirements',
    eligibility,
    explanation: buildExplanation(scoreReasons, interestReasons, preferenceReasons, confidence, subjectGaps, alternatives),
  };
}

async function findMatches(scores = {}, requirements = {}, interestProfile = null) {
  const resolvedInterestProfile =
    interestProfile || (requirements.interestStatement ? await buildInterestProfile(requirements.interestStatement) : null);
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
    const interestAssessment = buildInterestAssessment(course, resolvedInterestProfile);

    if (hasStructuredRequirements(course)) {
      const match = buildRequirementMatch(course, scores, requirements, interestAssessment, resolvedInterestProfile);
      if (match) {
        if (resolvedInterestProfile) {
          match.aiAssessment = {
            source: resolvedInterestProfile.source,
            profileLabel: 'Interest profile',
            matchedSubjects: [],
            recommendedSubjects: resolvedInterestProfile.preferredCourseAreas || [],
            model: resolvedInterestProfile.model || null,
            interestSummary: resolvedInterestProfile.summary,
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
        ? await buildCourseAssessment(candidate.course, scores, { interestProfile: resolvedInterestProfile })
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
      const scoreReasons = [
        ...assessment.reasons,
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
      ];
      const subjectGaps = detectSubjectGaps(
        candidate.course,
        scores,
        assessment.recommendedSubjects && assessment.recommendedSubjects.length
          ? assessment.recommendedSubjects
          : assessment.matchedSubjects
      );
      const eligibility = buildEligibility(matchScore, subjectGaps.length, false);
      const confidence = buildConfidence(matchScore, subjectPriorityScore, assessment.source, subjectGaps.length, false);
      const alternatives = buildAlternativeSuggestions(candidate.course, subjectGaps, resolvedInterestProfile);

      return {
        ...candidate.course.toJSON(),
        matchScore,
        matchReasons: [
          ...candidate.filteredReasons,
          ...scoreReasons,
          ...candidate.interestAssessment.reasons,
        ],
        studentAverageScore: calculateAverage(scores),
        subjectPriorityScore,
        matchMode: assessment.source,
        eligibility,
        explanation: buildExplanation(
          scoreReasons,
          candidate.interestAssessment.reasons,
          candidate.filteredReasons,
          confidence,
          subjectGaps,
          alternatives
        ),
        aiAssessment: {
          source: assessment.source,
          profileLabel: assessment.profileLabel,
          matchedSubjects: assessment.matchedSubjects,
          recommendedSubjects: assessment.recommendedSubjects,
          model: assessment.model || null,
          interestSummary: resolvedInterestProfile?.summary || null,
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
    const interestProfile = resolvedRequirements.interestStatement
      ? await buildInterestProfile(resolvedRequirements.interestStatement)
      : null;
    const matches = await findMatches(student.scores || {}, resolvedRequirements, interestProfile);

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
    const interestProfile = resolvedRequirements.interestStatement
      ? await buildInterestProfile(resolvedRequirements.interestStatement)
      : null;
    const matches = await findMatches(scores, resolvedRequirements, interestProfile);

    res.json({
      input: {
        scores,
        requirements: resolvedRequirements,
        interestStatement: resolvedRequirements.interestStatement || '',
        interestProfile,
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
    const interestProfile = resolvedRequirements.interestStatement
      ? await buildInterestProfile(resolvedRequirements.interestStatement)
      : null;
    const matches = await findMatches(parsed.scores || {}, resolvedRequirements, interestProfile);

    res.json({
      input: {
        student: parsed.student,
        scores: parsed.scores,
        subjects: parsed.subjects,
        requirements: resolvedRequirements,
        interestStatement: resolvedRequirements.interestStatement || '',
        interestProfile,
        averageScore: calculateAverage(parsed.scores),
      },
      matches,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
