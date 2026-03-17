const QWEN_ENDPOINT =
  process.env.QWEN_ENDPOINT ||
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-plus';
const QWEN_TIMEOUT_MS = Number(process.env.QWEN_TIMEOUT_MS || 12000);
const QWEN_MAX_CANDIDATES = Number(process.env.QWEN_MAX_CANDIDATES || 6);

const SUBJECT_ALIASES = {
  'bahasa melayu': 'malay language',
  'bahasa cina': 'chinese language',
  'bahasa tamil': 'tamil language',
  'bahasa arab': 'arabic language',
  'kesusasteraan inggeris': 'literature in english',
  'kesusasteraan melayu komunikatif': 'communicative malay literature',
  syariah: 'islamic law',
  usuluddin: 'islamic studies',
  sejarah: 'history',
  geografi: 'geography',
  ekonomi: 'economics',
  'pengajian perniagaan': 'business studies',
  perakaunan: 'accounting',
  'matematik m': 'mathematics m',
  'matematik t': 'mathematics t',
  'teknologi komunikasi dan informasi': 'information and communications technology',
  fizik: 'physics',
  kimia: 'chemistry',
  biologi: 'biology',
  'sains sukan': 'sports science',
  'seni visual': 'visual arts',
  'pengajian am': 'general studies',
  math: 'mathematics',
  maths: 'mathematics',
  ict: 'information and communications technology',
};

const COURSE_PROFILES = [
  {
    id: 'medicine',
    keywords: [
      'medicine',
      'medical',
      'biomedical',
      'biomedicine',
      'pharmacy',
      'nursing',
      'dentistry',
      'health',
      'clinical',
      'life science',
      'biotechnology',
      'biotech',
    ],
    recommendedSubjects: ['General Studies', 'Mathematics T', 'Chemistry', 'Biology'],
    optionalSubjects: ['Physics'],
    label: 'Medicine or life science',
  },
  {
    id: 'engineering',
    keywords: [
      'engineering',
      'robotic',
      'mechatronic',
      'mechanical',
      'electrical',
      'electronic',
      'civil',
      'chemical engineering',
      'applied science',
      'manufacturing',
      'technology',
      'computer science',
      'software',
      'data science',
      'artificial intelligence',
      'information technology',
      'computing',
    ],
    recommendedSubjects: ['General Studies', 'Mathematics T', 'Chemistry', 'Physics'],
    optionalSubjects: ['Information and Communications Technology'],
    label: 'Engineering or applied science',
  },
  {
    id: 'accounting',
    keywords: ['accounting', 'finance', 'economics', 'banking', 'actuarial'],
    recommendedSubjects: ['General Studies', 'Mathematics M', 'Economics', 'Accounting'],
    optionalSubjects: ['Business Studies'],
    label: 'Accounting or finance',
  },
  {
    id: 'business',
    keywords: ['business', 'management', 'marketing', 'commerce', 'entrepreneurship', 'administration'],
    recommendedSubjects: ['General Studies', 'Mathematics M', 'Economics', 'Business Studies'],
    optionalSubjects: ['Accounting'],
    label: 'Business or management',
  },
  {
    id: 'law-education',
    keywords: ['law', 'legal', 'education', 'teaching', 'teacher'],
    recommendedSubjects: ['General Studies', 'Malay Language', 'Geography', 'History'],
    optionalSubjects: ['Literature in English'],
    label: 'Law or education',
  },
  {
    id: 'language-arts',
    keywords: ['language', 'literature', 'linguistic', 'communication', 'english', 'arabic', 'malay studies'],
    recommendedSubjects: ['Malay Language', 'Literature in English', 'Communicative Malay Literature'],
    optionalSubjects: ['Chinese Language', 'Tamil Language', 'Arabic Language', 'History'],
    label: 'Language or literature',
  },
  {
    id: 'arts-sports',
    keywords: ['arts', 'design', 'visual', 'music', 'sport', 'sports science'],
    recommendedSubjects: ['General Studies', 'Visual Arts', 'Sports Science'],
    optionalSubjects: ['Malay Language'],
    label: 'Arts or sports',
  },
];

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function canonicalSubject(value = '') {
  const normalized = normalizeText(value);
  return SUBJECT_ALIASES[normalized] || normalized;
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

function findSubjectMatch(studentScores, requestedSubject) {
  const target = canonicalSubject(requestedSubject);
  if (!target) {
    return null;
  }

  const direct = studentScores.find((entry) => entry.canonical === target);
  if (direct) {
    return direct;
  }

  return studentScores.find(
    (entry) =>
      entry.canonical.includes(target) ||
      target.includes(entry.canonical) ||
      normalizeText(entry.subject).includes(target) ||
      target.includes(normalizeText(entry.subject))
  );
}

function extractCourseText(course) {
  const modules = Array.isArray(course.modules) ? course.modules.map((module) => module.name).join(' ') : '';
  return normalizeText(
    [course.name, course.faculty, course.description, course.entryRequirements, modules].filter(Boolean).join(' ')
  );
}

function inferCourseProfile(course) {
  const courseText = extractCourseText(course);
  return COURSE_PROFILES.find((profile) =>
    profile.keywords.some((keyword) => courseText.includes(normalizeText(keyword)))
  );
}

function average(values) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildHeuristicAssessment(course, scores = {}) {
  const studentScores = scoreEntries(scores);
  const profile = inferCourseProfile(course);

  if (!profile) {
    const baseAverage = average(studentScores.map((entry) => entry.value));
    return {
      applicable: baseAverage !== null && baseAverage >= 60,
      score: baseAverage === null ? 35 : Math.max(35, Math.min(78, Math.round(baseAverage))),
      reasons: baseAverage === null
        ? ['No structured requirements available and no clear course-subject profile was detected.']
        : ['No structured requirements available; using overall academic performance as a fallback.'],
      matchedSubjects: [],
      recommendedSubjects: [],
      profileLabel: null,
      source: 'heuristic',
    };
  }

  const requiredMatches = profile.recommendedSubjects
    .map((subject) => findSubjectMatch(studentScores, subject))
    .filter(Boolean);
  const optionalMatches = profile.optionalSubjects
    .map((subject) => findSubjectMatch(studentScores, subject))
    .filter(Boolean);

  const relevantScores = [...requiredMatches, ...optionalMatches].map((entry) => entry.value);
  const relevantAverage = average(relevantScores);
  const requiredCoverage = profile.recommendedSubjects.length
    ? requiredMatches.length / profile.recommendedSubjects.length
    : 0;

  const score = Math.round(
    Math.max(
      25,
      Math.min(
        95,
        30 +
          requiredCoverage * 40 +
          (optionalMatches.length ? 10 : 0) +
          ((relevantAverage === null ? 0 : relevantAverage) * 0.2)
      )
    )
  );

  const applicable = requiredMatches.length >= Math.max(1, Math.ceil(profile.recommendedSubjects.length / 2));
  const reasons = [];
  if (requiredMatches.length) {
    reasons.push(
      `Relevant subjects found for ${profile.label}: ${requiredMatches
        .map((entry) => `${entry.subject} (${entry.value})`)
        .join(', ')}.`
    );
  } else {
    reasons.push(`No strong subject overlap found for the ${profile.label.toLowerCase()} profile.`);
  }
  if (relevantAverage !== null) {
    reasons.push(`Average across matched subjects is ${relevantAverage.toFixed(2)}.`);
  }

  return {
    applicable,
    score,
    reasons,
    matchedSubjects: requiredMatches.map((entry) => entry.subject),
    recommendedSubjects: profile.recommendedSubjects,
    profileLabel: profile.label,
    source: 'heuristic',
  };
}

function isQwenConfigured() {
  return Boolean(process.env.QWEN_API_KEY);
}

function getQwenCandidateLimit() {
  return Number.isFinite(QWEN_MAX_CANDIDATES) && QWEN_MAX_CANDIDATES > 0 ? QWEN_MAX_CANDIDATES : 6;
}

function extractMessageContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || '').join('');
  }
  return String(content || '');
}

function parseJsonResponse(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('Qwen returned an empty response');
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

async function assessCourseWithQwen(course, scores = {}, heuristicAssessment) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QWEN_TIMEOUT_MS);

  const promptPayload = {
    studentScores: scoreEntries(scores).map((entry) => ({
      subject: entry.subject,
      score: entry.value,
    })),
    course: {
      name: course.name,
      faculty: course.faculty,
      awardLevel: course.awardLevel,
      description: course.description,
      entryRequirements: course.entryRequirements,
      modules: Array.isArray(course.modules) ? course.modules.map((module) => module.name).slice(0, 20) : [],
    },
    heuristicAssessment,
    subjectReference: {
      categories: {
        languageAndLiterature: [
          'Malay Language',
          'Chinese Language',
          'Tamil Language',
          'Arabic Language',
          'Literature in English',
          'Communicative Malay Literature',
        ],
        socialSciencesAndReligiousStudies: [
          'Islamic Law',
          'Islamic Studies',
          'History',
          'Geography',
          'Economics',
          'Business Studies',
          'Accounting',
        ],
        sciencesAndMathematics: [
          'Mathematics M',
          'Mathematics T',
          'Information and Communications Technology',
          'Physics',
          'Chemistry',
          'Biology',
        ],
        artsAndSports: ['Sports Science', 'Visual Arts'],
        generalKnowledge: ['General Studies'],
      },
      programmeGuidance: [
        {
          area: 'Medicine, medical, or life science courses',
          recommendedSubjects: ['General Studies', 'Mathematics T', 'Chemistry', 'Biology'],
        },
        {
          area: 'Engineering or applied science courses',
          recommendedSubjects: ['General Studies', 'Mathematics T', 'Chemistry', 'Physics'],
        },
        {
          area: 'Accounting, arts, or social science courses',
          recommendedSubjects: ['General Studies', 'Mathematics M', 'Economics'],
        },
        {
          area: 'Business, arts, or social science courses',
          recommendedSubjects: ['General Studies', 'Mathematics M', 'Economics', 'Business Studies'],
        },
        {
          area: 'Law or education',
          recommendedSubjects: ['General Studies', 'Malay Language', 'Geography', 'History'],
        },
      ],
    },
    outputContract: {
      applicable: 'boolean',
      score: 'integer from 0 to 100',
      reasons: ['short strings'],
      matchedSubjects: ['student subject names that matter most'],
      recommendedSubjects: ['recommended or expected subjects for the course'],
    },
  };

  try {
    const response = await fetch(QWEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: QWEN_MODEL,
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You assess whether a student subject-score profile is academically suitable for a university course in Malaysia. Be conservative. Use the course text first. If explicit entry requirements are absent, infer suitability from recommended STPM/related subject combinations. Return JSON only.',
          },
          {
            role: 'user',
            content: JSON.stringify(promptPayload),
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || `Qwen request failed with ${response.status}`);
    }

    const parsed = parseJsonResponse(extractMessageContent(payload));
    return {
      applicable: Boolean(parsed?.applicable),
      score: Number.isFinite(Number(parsed?.score)) ? Math.max(0, Math.min(100, Math.round(Number(parsed.score)))) : heuristicAssessment.score,
      reasons: Array.isArray(parsed?.reasons) ? parsed.reasons.map((reason) => String(reason)) : heuristicAssessment.reasons,
      matchedSubjects: Array.isArray(parsed?.matchedSubjects)
        ? parsed.matchedSubjects.map((subject) => String(subject))
        : heuristicAssessment.matchedSubjects,
      recommendedSubjects: Array.isArray(parsed?.recommendedSubjects)
        ? parsed.recommendedSubjects.map((subject) => String(subject))
        : heuristicAssessment.recommendedSubjects,
      profileLabel: heuristicAssessment.profileLabel,
      source: 'qwen',
      model: QWEN_MODEL,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function buildCourseAssessment(course, scores = {}) {
  const heuristicAssessment = buildHeuristicAssessment(course, scores);
  if (!isQwenConfigured()) {
    return heuristicAssessment;
  }

  try {
    return await assessCourseWithQwen(course, scores, heuristicAssessment);
  } catch (error) {
    return {
      ...heuristicAssessment,
      reasons: [...heuristicAssessment.reasons, `Qwen fallback used: ${error.message}`],
    };
  }
}

module.exports = {
  buildHeuristicAssessment,
  buildCourseAssessment,
  canonicalSubject,
  findSubjectMatch,
  getQwenCandidateLimit,
  isQwenConfigured,
  scoreEntries,
};
