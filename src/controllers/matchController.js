const { Student, Course, University, CourseModule } = require('../models');
const { deriveUniversityAbbreviation } = require('../utils/universityAbbreviation');

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

function courseMatchesStudent(course, scores = {}, requirements = {}) {
  const reasons = [];
  const reqs = course.requirements || {};
  const average = calculateAverage(scores);

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

  if (reqs.minAverage && average !== null) {
    if (average < Number(reqs.minAverage)) {
      return null;
    }
    reasons.push(`Average score meets minimum ${reqs.minAverage}`);
  }

  if (reqs.subjects && Array.isArray(reqs.subjects)) {
    const normalizedSubjects = reqs.subjects.map((subject) => String(subject).toLowerCase());
    const studentSubjects = Object.keys(scores).map((subject) => subject.toLowerCase());
    const hasAllSubjects = normalizedSubjects.every((subject) => studentSubjects.includes(subject));
    if (!hasAllSubjects) {
      return null;
    }
    reasons.push('Required subjects provided');
  }

  let matchScore = average !== null ? Math.round(average) : 50;
  if (requirements.preferredFaculty) {
    matchScore += 10;
  }
  if (Array.isArray(requirements.preferredUniversityIds) && requirements.preferredUniversityIds.length) {
    matchScore += 10;
  }
  if (!Object.keys(reqs).length) {
    reasons.push('No structured requirements yet, listed as a possible match');
  }

  return {
    ...course.toJSON(),
    matchScore,
    matchReasons: reasons,
    studentAverageScore: average,
  };
}

async function findMatches(scores = {}, requirements = {}) {
  const courses = await Course.findAll({
    include: [
      { model: University, as: 'university' },
      { model: CourseModule, as: 'modules' },
    ],
  });

  return courses
    .map((course) => courseMatchesStudent(course, scores, requirements))
    .filter(Boolean)
    .sort((a, b) => b.matchScore - a.matchScore || a.name.localeCompare(b.name));
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
