const { htmlToTextLines, normalizeWhitespace } = require('../utils/html');

const BASE_URL = 'https://www.uum.edu.my';
const PROGRAMMES_URL = `${BASE_URL}/admissions/application-guidelines/undergraduate-local`;

const PROGRAMME_FACULTY_MAP = {
  'Bachelor of Accounting (Information System) with Honours':
    'Pusat Pengajian Perakaunan (Tunku Puteri Intan Safinaz School of Accountancy)',
  'Bachelor of Accounting with Honours':
    'Pusat Pengajian Perakaunan (Tunku Puteri Intan Safinaz School of Accountancy)',
  'Bachelor of Applied History with Honours': 'Pusat Pengajian Bahasa, Tamadun dan Falsafah',
  'Bachelor of Applied Linguistics and Business Administration with Honours':
    'Pusat Pengajian Bahasa, Tamadun dan Falsafah',
  'Bachelor of Arts in Contemporary Literature and Creative Industry Management (Honours) *':
    'Pusat Pengajian Bahasa, Tamadun dan Falsafah',
  'Bachelor of Arts in Linguistics and Information Technology (Honours) *':
    'Pusat Pengajian Bahasa, Tamadun dan Falsafah',
  'Bachelor of Business Administration (Golf Management) with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Business Administration (Logistics and Transportation) with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Business Administration with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Communication with Honours': 'Pusat Pengajian Bahasa, Tamadun dan Falsafah',
  'Bachelor of Computer Science with Honours': 'Pusat Pengajian Pengkomputeran',
  'Bachelor of Counselling with Honours *': 'Pusat Pengajian Sains Sosial',
  'Bachelor of Creative Industry Management with Honours *': 'Pusat Pengajian Bahasa, Tamadun dan Falsafah',
  'Bachelor of Development Management with Honours': 'Pusat Pengajian Sains Sosial',
  'Bachelor of Education with Honours (Accounting) *':
    'Pusat Pengajian Perakaunan (Tunku Puteri Intan Safinaz School of Accountancy)',
  'Bachelor of Education with Honours (Business Management) *':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Education with Honours (Guidance and Counselling) *': 'Pusat Pengajian Sains Sosial',
  'Bachelor of Education with Honours (Information Technology) *': 'Pusat Pengajian Pengkomputeran',
  'Bachelor of Education with Honours (Moral Education) *': 'Pusat Pengajian Sains Sosial',
  'Bachelor of Entrepreneurship with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Entrepreneurship with Honours (Mode 2u2i) *':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Event Management with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Finance with Honours': 'Pusat Pengajian Ekonomi, Kewangan dan Perbankan',
  'Bachelor of Hospitality Management with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Human Resource Management with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of International Affairs Management with Honours': 'Pusat Pengajian Antarabangsa',
  'Bachelor of International Business Management with Honours': 'Pusat Pengajian Antarabangsa',
  'Bachelor of Islamic Finance and Banking with Honours': 'Pusat Pengajian Ekonomi, Kewangan dan Perbankan',
  'Bachelor of Marketing with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Media Technology with Honours': 'Pusat Pengajian Pengkomputeran',
  'Bachelor of Muamalat Administration with Honours': 'Pusat Pengajian Undang-undang',
  'Bachelor of Operations Management with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Law with Honours': 'Pusat Pengajian Undang-undang',
  'Bachelor of Philosophy, Law and Business with Honours *': 'Pusat Pengajian Undang-undang',
  'Bachelor of Public Management with Honours': 'Pusat Pengajian Sains Sosial',
  'Bachelor of Risk Management and Insurance with Honours': 'Pusat Pengajian Ekonomi, Kewangan dan Perbankan',
  'Bachelor of Science Agribusiness Management with Honours': 'Pusat Pengajian Ekonomi, Kewangan dan Perbankan',
  'Bachelor of Science Economics with Honours': 'Pusat Pengajian Ekonomi, Kewangan dan Perbankan',
  'Bachelor of Science with Honours (Business Mathematics)':
    'Pusat Pengajian Ekonomi, Kewangan dan Perbankan',
  'Bachelor of Science with Honours (Decision Science)': 'Pusat Pengajian Pengkomputeran',
  'Bachelor of Science with Honours (Industrial Statistics)': 'Pusat Pengajian Pengkomputeran',
  'Bachelor of Science with Honours (Information Technology)': 'Pusat Pengajian Pengkomputeran',
  'Bachelor of Science with Honours (Multimedia)': 'Pusat Pengajian Pengkomputeran',
  'Bachelor of Social Work Management with Honours *': 'Pusat Pengajian Sains Sosial',
  'Bachelor of Technology Management with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
  'Bachelor of Tourism Management with Honours':
    'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)',
};

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

function extractGeneralRequirements(lines) {
  const startIndex = lines.findIndex((line) => /^GENERAL ENTRY REQUIREMENT \(LOCAL\)$/i.test(line));
  const endIndex = lines.findIndex((line) => /^### PROGRAMMES OFFERED$/i.test(line) || /^PROGRAMMES OFFERED$/i.test(line));
  const scopedLines =
    startIndex >= 0 ? lines.slice(startIndex + 1, endIndex > startIndex ? endIndex : undefined) : [];

  return scopedLines.join('\n').trim() || null;
}

function extractProgrammes(lines) {
  const startIndex = lines.findIndex((line) => /^### PROGRAMMES OFFERED$/i.test(line) || /^PROGRAMMES OFFERED$/i.test(line));
  const endIndex = lines.findIndex((line) => /^\* Interviewed programme$/i.test(line));
  const scopedLines =
    startIndex >= 0 ? lines.slice(startIndex + 1, endIndex > startIndex ? endIndex : undefined) : [];

  return scopedLines.filter((line) => /^Bachelor\b/i.test(line));
}

function normalizeProgrammeName(name) {
  return String(name || '').replace(/\s+\*$/, '').trim();
}

function deriveRequirements(entryRequirements) {
  if (!entryRequirements) {
    return null;
  }

  const text = entryRequirements.toLowerCase();
  const requirements = {
    rawText: entryRequirements,
  };

  if (text.includes('muet')) {
    requirements.languageExam = 'MUET';
  }

  if (text.includes('general studies') || text.includes('pengajian am')) {
    requirements.subjects = ['General Studies'];
  }

  return requirements;
}

function facultyForProgramme(name) {
  const exact = PROGRAMME_FACULTY_MAP[name];
  if (exact) {
    return exact;
  }

  const normalized = normalizeProgrammeName(name);
  return PROGRAMME_FACULTY_MAP[normalized] || 'Pusat Pengajian Pengurusan Perniagaan (School of Business Management)';
}

function extractProgrammesFromHtml(html) {
  const lines = htmlToTextLines(html);
  const entryRequirements = extractGeneralRequirements(lines);
  const programmeNames = extractProgrammes(lines);

  if (!programmeNames.length) {
    throw new Error('Unable to extract programmes from UUM undergraduate page');
  }

  return programmeNames.map((name) => {
    const faculty = facultyForProgramme(name);
    return {
      university: {
        slug: 'universiti-utara-malaysia',
        name: 'Universiti Utara Malaysia',
        country: 'Malaysia',
        state: 'Kedah',
        city: 'Sintok',
        websiteUrl: BASE_URL,
        sourceType: 'official',
        metadata: {
          sourceDomain: 'uum.edu.my',
        },
      },
      course: {
        code: null,
        slug: slugify(`${faculty}-${name}`),
        name: normalizeProgrammeName(name),
        awardLevel: inferAwardLevel(name),
        faculty,
        studyMode: 'full-time',
        durationText: null,
        intakeText: null,
        tuitionText: null,
        description: `${normalizeProgrammeName(name)} offered by ${faculty} at Universiti Utara Malaysia.`,
        entryRequirements,
        careerProspects: null,
        sourceUrl: PROGRAMMES_URL,
        requirements: deriveRequirements(entryRequirements),
        metadata: {
          scraper: 'uum',
          sourcePage: 'undergraduate-local',
        },
      },
      modules: [],
    };
  });
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
  key: 'uum',
  label: 'Universiti Utara Malaysia',
  discoverProgrammeUrls,
  scrapeProgramme,
};
