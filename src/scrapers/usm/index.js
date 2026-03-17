const { htmlToTextLines, normalizeWhitespace } = require('../utils/html');

const BASE_URL = 'https://admission.usm.my';
const MALAYSIAN_PROGRAMMES_URL = `${BASE_URL}/index.php/undergraduate/undergraduate-malaysian`;
const INTERNATIONAL_PROGRAMMES_URL = `${BASE_URL}/index.php/undergraduate/undergraduate-international`;

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

function normalizeProgrammeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\(honours\)/g, '')
    .replace(/\bupu\b/g, '')
    .replace(/\busm\+?1\b/g, '')
    .replace(/\bprogramme\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeProgrammeName(line) {
  return normalizeWhitespace(
    String(line || '')
      .replace(/^#+\s*/, '')
      .replace(/^\*+\s*/, '')
      .replace(/^US[A-Z0-9-]*\s*[-–—:]?\s*/i, '')
      .replace(/^\d+\s*[-–—:]?\s*/, '')
      .replace(/\s*\((UPU|USM\+?1)\)\s*$/i, '')
      .replace(/\s+/g, ' ')
  );
}

function isFacultyLine(line) {
  return /^(school of|centre for|center for|school|faculty of)\b/i.test(line);
}

function isProgrammeLine(line) {
  const cleaned = sanitizeProgrammeName(line);
  return /^(bachelor|doctor|diploma|foundation|master)\b/i.test(cleaned);
}

function isNoiseLine(line) {
  return (
    /^undergraduate/i.test(line) ||
    /^apply/i.test(line) ||
    /^programmes?$/i.test(line) ||
    /^home$/i.test(line) ||
    /^international students$/i.test(line) ||
    /^malaysian students$/i.test(line)
  );
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

function buildInternationalFacultyMap(html) {
  const lines = htmlToTextLines(html);
  const programmeToFaculty = new Map();
  let currentFaculty = null;

  for (const line of lines) {
    if (isNoiseLine(line)) {
      continue;
    }

    if (isFacultyLine(line)) {
      currentFaculty = line;
      continue;
    }

    if (!currentFaculty || !isProgrammeLine(line)) {
      continue;
    }

    const programmeName = sanitizeProgrammeName(line);
    const normalizedProgramme = normalizeProgrammeName(programmeName);
    if (!normalizedProgramme) {
      continue;
    }

    programmeToFaculty.set(normalizedProgramme, currentFaculty);
  }

  if (!programmeToFaculty.size) {
    throw new Error('Unable to extract programme-to-faculty mapping from USM international page');
  }

  return programmeToFaculty;
}

function inferFacultyFromName(programmeName, programmeToFaculty) {
  const normalizedProgramme = normalizeProgrammeName(programmeName);
  if (!normalizedProgramme) {
    return null;
  }

  if (programmeToFaculty.has(normalizedProgramme)) {
    return programmeToFaculty.get(normalizedProgramme);
  }

  for (const [candidateName, faculty] of programmeToFaculty.entries()) {
    if (
      candidateName.includes(normalizedProgramme) ||
      normalizedProgramme.includes(candidateName)
    ) {
      return faculty;
    }
  }

  return null;
}

function extractProgrammesFromMalaysianHtml(html, programmeToFaculty) {
  const lines = htmlToTextLines(html);
  const programmes = [];
  const seen = new Set();
  let currentFaculty = null;

  for (const line of lines) {
    if (isNoiseLine(line)) {
      continue;
    }

    if (isFacultyLine(line)) {
      currentFaculty = line;
      continue;
    }

    if (!isProgrammeLine(line)) {
      continue;
    }

    const name = sanitizeProgrammeName(line);
    const normalizedName = normalizeProgrammeName(name);
    if (!normalizedName || seen.has(normalizedName)) {
      continue;
    }
    seen.add(normalizedName);

    const faculty = inferFacultyFromName(name, programmeToFaculty) || currentFaculty || 'Unknown School';
    programmes.push({
      university: {
        slug: 'universiti-sains-malaysia',
        name: 'Universiti Sains Malaysia',
        country: 'Malaysia',
        state: 'Pulau Pinang',
        city: 'Gelugor',
        websiteUrl: BASE_URL,
        sourceType: 'official',
        metadata: {
          sourceDomain: 'admission.usm.my',
        },
      },
      course: {
        code: null,
        slug: slugify(`${faculty}-${name}`),
        name,
        awardLevel: inferAwardLevel(name),
        faculty,
        studyMode: 'full-time',
        durationText: null,
        intakeText: null,
        tuitionText: null,
        description: `${name} offered by ${faculty} at Universiti Sains Malaysia.`,
        entryRequirements: null,
        careerProspects: null,
        sourceUrl: MALAYSIAN_PROGRAMMES_URL,
        requirements: null,
        metadata: {
          scraper: 'usm',
          sourcePage: 'undergraduate-malaysian',
          facultySourcePage: 'undergraduate-international',
        },
      },
      modules: [],
    });
  }

  if (!programmes.length) {
    throw new Error('Unable to extract programmes from USM undergraduate page');
  }

  return programmes;
}

async function discoverProgrammeUrls(options = {}) {
  if (options.sourceUrl) {
    return [options.sourceUrl];
  }
  return [MALAYSIAN_PROGRAMMES_URL];
}

async function scrapeProgramme(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const pageUrl = options.sourceUrl || url;
  const [malaysianHtml, internationalHtml] = await Promise.all([
    fetchHtml(pageUrl, fetchImpl),
    fetchHtml(INTERNATIONAL_PROGRAMMES_URL, fetchImpl),
  ]);

  const programmeToFaculty = buildInternationalFacultyMap(internationalHtml);
  const programmes = extractProgrammesFromMalaysianHtml(malaysianHtml, programmeToFaculty);

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
  key: 'usm',
  label: 'Universiti Sains Malaysia',
  discoverProgrammeUrls,
  scrapeProgramme,
};
