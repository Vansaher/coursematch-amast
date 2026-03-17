const { htmlToTextLines, normalizeWhitespace } = require('../utils/html');

const BASE_URL = 'https://admission.utm.my';
const PROGRAMMES_URL = `${BASE_URL}/offered-allcourses-malaysian/`;

const FACULTY_MARKERS = [
  'Faculty of Artificial Intelligence (Formerly known as RAZAK Faculty of Technology and Informatics)',
  'Faculty of Educational Sciences and Technology',
  'Malaysia-Japan International Institute of Technology',
  'Faculty of Chemical and Energy Engineering',
  'Faculty of Built Environment and Surveying',
  'Faculty of Social Science and Humanities',
  'Faculty of Electrical Engineering',
  'Faculty of Mechanical Engineering',
  'Faculty of Civil Engineering',
  'Faculty of Management',
  'Faculty of Computing',
  'Faculty of Science',
  'Faculty of Artificial Intelligence',
  'Azman Hashim International Business School',
];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferAwardLevel(name) {
  const lower = String(name || '').toLowerCase();

  if (lower.includes('foundation')) return 'foundation';
  if (lower.includes('certificate')) return 'certificate';
  if (lower.includes('diploma')) return 'diploma';
  if (lower.includes('bachelor')) return 'bachelor';
  if (lower.includes('doctor')) return 'doctorate';
  if (lower.includes('master')) return 'master';
  return 'other';
}

async function fetchHtml(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: {
      'user-agent': 'course-matching-bot/1.0 (+academic project)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseProgrammeLine(line) {
  const cleaned = normalizeWhitespace(
    String(line || '')
      .replace(/\b(?:Apply|Closed|More Details)\b/g, ' ')
      .replace(/\s+/g, ' ')
  );

  if (!/^Bachelor\b/i.test(cleaned)) {
    return null;
  }

  const semesterMatch = cleaned.match(/\b(September\/February|September|February)\b/i);
  if (!semesterMatch) {
    return null;
  }

  const semesterText = semesterMatch[1];
  const beforeSemester = cleaned.slice(0, semesterMatch.index).trim();
  const faculty = [...FACULTY_MARKERS]
    .sort((a, b) => b.length - a.length)
    .find((marker) => beforeSemester.includes(marker));

  if (!faculty) {
    return null;
  }

  const name = beforeSemester.slice(0, beforeSemester.indexOf(faculty)).trim();
  if (!name) {
    return null;
  }

  return {
    name,
    faculty,
    semesterText,
  };
}

function extractProgrammesFromHtml(html) {
  const lines = htmlToTextLines(html);
  const startIndex = lines.findIndex((line) => /^Programme Offered$/i.test(line));
  const endIndex = lines.findIndex((line) => /^Connect with us$/i.test(line));
  const scopedLines =
    startIndex >= 0 ? lines.slice(startIndex + 1, endIndex > startIndex ? endIndex : undefined) : lines;

  const programmes = [];
  const seen = new Set();

  for (const line of scopedLines) {
    const parsed = parseProgrammeLine(line);
    if (!parsed) {
      continue;
    }

    const key = `${parsed.name}||${parsed.faculty}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    programmes.push({
      university: {
        slug: 'universiti-teknologi-malaysia',
        name: 'Universiti Teknologi Malaysia',
        country: 'Malaysia',
        state: 'Johor',
        city: 'Johor Bahru',
        websiteUrl: BASE_URL,
        sourceType: 'official',
        metadata: {
          sourceDomain: 'admission.utm.my',
        },
      },
      course: {
        code: null,
        slug: slugify(`${parsed.faculty}-${parsed.name}`),
        name: parsed.name,
        awardLevel: inferAwardLevel(parsed.name),
        faculty: parsed.faculty,
        studyMode: 'full-time',
        durationText: null,
        intakeText: parsed.semesterText,
        tuitionText: null,
        description: `${parsed.name} offered by ${parsed.faculty} at Universiti Teknologi Malaysia.`,
        entryRequirements: null,
        careerProspects: null,
        sourceUrl: PROGRAMMES_URL,
        requirements: null,
        metadata: {
          scraper: 'utm',
          sourcePage: 'offered-allcourses-malaysian',
        },
      },
      modules: [],
    });
  }

  if (!programmes.length) {
    throw new Error('Unable to extract programmes from UTM offered courses page');
  }

  return programmes;
}

async function discoverProgrammeUrls(options = {}) {
  if (options.sourceUrl) {
    return [options.sourceUrl];
  }
  return [PROGRAMMES_URL];
}

async function scrapeProgramme(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const pageUrl = options.sourceUrl || url;
  const html = await fetchHtml(pageUrl, fetchImpl);
  const programmes = extractProgrammesFromHtml(html);

  return {
    multiCourse: true,
    university: programmes[0] ? programmes[0].university : null,
    courses: programmes.map((programme) => ({
      ...programme.course,
      sourceUrl: `${pageUrl}#${programme.course.slug}`,
    })),
    modulesByCourseSlug: {},
  };
}

module.exports = {
  key: 'utm',
  label: 'Universiti Teknologi Malaysia',
  discoverProgrammeUrls,
  scrapeProgramme,
};
