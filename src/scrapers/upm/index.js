const { htmlToTextLines, normalizeWhitespace } = require('../utils/html');

const BASE_URL = 'https://www.upm.edu.my';
const FALLBACK_SOURCE_URL = `${BASE_URL}/admission/programmes/undergraduate-75800`;
const PROGRAMME_SOURCE_URLS = [
  'https://web.upm.edu.my/kemasukan/program/prasiswazah-75800',
  FALLBACK_SOURCE_URL,
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
  if (lower.includes('asasi')) return 'foundation';
  if (lower.includes('certificate')) return 'certificate';
  if (lower.includes('diploma')) return 'diploma';
  if (lower.includes('bachelor')) return 'bachelor';
  if (lower.includes('bacelor')) return 'bachelor';
  if (lower.includes('doctor')) return 'doctorate';
  if (lower.includes('doktor')) return 'doctorate';
  if (lower.includes('master')) return 'master';
  if (lower.includes('sarjana')) return 'master';
  return 'other';
}

function isFacultyLine(line) {
  return (
    /^faculty of /i.test(line) ||
    /^school of /i.test(line) ||
    /^fakulti /i.test(line) ||
    /^pusat /i.test(line)
  );
}

function isProgrammeLine(line) {
  return /^(bachelor|bacelor|doctor|doktor|foundation|asasi|diploma)\b/i.test(line);
}

function sanitizeProgrammeName(line) {
  return normalizeWhitespace(
    line
      .replace(/^[*-]\s*/, '')
      .replace(/\s+#$/, '')
      .replace(/\s+/g, ' ')
  );
}

function buildProgrammeDescription(name, faculty) {
  return `${name} offered by ${faculty} at Universiti Putra Malaysia.`;
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

async function fetchProgrammePage(fetchImpl = fetch) {
  const errors = [];

  for (const url of PROGRAMME_SOURCE_URLS) {
    try {
      const html = await fetchHtml(url, fetchImpl);
      return { url, html };
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  throw new Error(`Failed to fetch all UPM programme sources. ${errors.join(' | ')}`);
}

function extractProgrammesFromHtml(html) {
  const lines = htmlToTextLines(html);
  const programmes = [];
  let currentFaculty = null;

  for (const line of lines) {
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
        slug: 'universiti-putra-malaysia',
        name: 'Universiti Putra Malaysia',
        country: 'Malaysia',
        state: 'Selangor',
        city: 'Serdang',
        websiteUrl: BASE_URL,
        sourceType: 'official',
        metadata: {
          sourceDomain: 'upm.edu.my',
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
        description: buildProgrammeDescription(name, currentFaculty),
        entryRequirements: null,
        careerProspects: null,
        sourceUrl: FALLBACK_SOURCE_URL,
        requirements: null,
        metadata: {
          scraper: 'upm',
          sourcePage: 'undergraduate-programmes',
        },
      },
      modules: [],
    });
  }

  if (!programmes.length) {
    throw new Error('Unable to extract programmes from UPM undergraduate page');
  }

  return programmes;
}

async function discoverProgrammeUrls() {
  return [PROGRAMME_SOURCE_URLS[0]];
}

async function scrapeProgramme(url, fetchImpl = fetch) {
  const page = await fetchProgrammePage(fetchImpl);
  const html = page.html;
  const programmes = extractProgrammesFromHtml(html);

  return {
    multiCourse: true,
    university: programmes[0] ? programmes[0].university : null,
    courses: programmes.map((programme) => ({
      ...programme.course,
      sourceUrl: `${page.url}#${programme.course.slug}`,
    })),
    modulesByCourseSlug: {},
  };
}

module.exports = {
  key: 'upm',
  label: 'Universiti Putra Malaysia',
  discoverProgrammeUrls,
  scrapeProgramme,
};
