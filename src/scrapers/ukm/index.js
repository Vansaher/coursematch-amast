const { htmlToTextLines, normalizeWhitespace } = require('../utils/html');

const BASE_URL = 'https://www.ukm.my';
const PROGRAMMES_URL = `${BASE_URL}/portalukm/undergraduate/`;

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

function isFacultyLine(line) {
  return (
    /^faculty of /i.test(line) ||
    /^school of /i.test(line) ||
    /^citra university study center$/i.test(line)
  );
}

function isProgrammeLine(line) {
  return /^(bachelor|degree|doctor)\b/i.test(line);
}

function sanitizeProgrammeName(line) {
  return normalizeWhitespace(line.replace(/\s+#$/, '').replace(/\s+/g, ' '));
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

function extractProgrammesFromHtml(html) {
  const lines = htmlToTextLines(html);
  const startIndex = lines.findIndex((line) => /^Malaysian Students$/i.test(line));
  const endIndex = lines.findIndex((line) => /^International Students$/i.test(line));
  const scopedLines =
    startIndex >= 0 ? lines.slice(startIndex + 1, endIndex > startIndex ? endIndex : undefined) : lines;

  const programmes = [];
  let currentFaculty = null;

  for (const line of scopedLines) {
    if (isFacultyLine(line)) {
      currentFaculty = line;
      continue;
    }

    if (!currentFaculty || !isProgrammeLine(line)) {
      continue;
    }

    const name = sanitizeProgrammeName(line);
    if (!name || name.length < 6) {
      continue;
    }

    programmes.push({
      university: {
        slug: 'universiti-kebangsaan-malaysia',
        name: 'Universiti Kebangsaan Malaysia',
        country: 'Malaysia',
        state: 'Selangor',
        city: 'Bangi',
        websiteUrl: BASE_URL,
        sourceType: 'official',
        metadata: {
          sourceDomain: 'ukm.my',
        },
      },
      course: {
        code: null,
        slug: slugify(`${currentFaculty}-${name}`),
        name,
        awardLevel: inferAwardLevel(name),
        faculty: currentFaculty,
        studyMode: 'full-time',
        durationText: null,
        intakeText: null,
        tuitionText: null,
        description: `${name} offered by ${currentFaculty} at Universiti Kebangsaan Malaysia.`,
        entryRequirements: null,
        careerProspects: null,
        sourceUrl: PROGRAMMES_URL,
        requirements: null,
        metadata: {
          scraper: 'ukm',
          sourcePage: 'undergraduate-programmes',
        },
      },
      modules: [],
    });
  }

  if (!programmes.length) {
    throw new Error('Unable to extract programmes from UKM undergraduate page');
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
  key: 'ukm',
  label: 'Universiti Kebangsaan Malaysia',
  discoverProgrammeUrls,
  scrapeProgramme,
};
