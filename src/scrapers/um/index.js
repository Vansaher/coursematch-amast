const {
  extractLinks,
  matchFirst,
  normalizeWhitespace,
  splitListItems,
  textFromHtml,
} = require('../utils/html');

const BASE_URL = 'https://study.um.edu.my';
const PROGRAMMES_URL = `${BASE_URL}/programmes`;

function absoluteUrl(href) {
  return new URL(href, BASE_URL).toString();
}

function inferAwardLevel(name) {
  const lower = String(name || '').toLowerCase();

  if (lower.includes('foundation')) return 'foundation';
  if (lower.includes('certificate')) return 'certificate';
  if (lower.includes('diploma')) return 'diploma';
  if (lower.includes('bachelor')) return 'bachelor';
  if (lower.includes('master')) return 'master';
  if (lower.includes('doctor')) return 'doctorate';
  return 'other';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractSection(html, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `<h[1-6][^>]*>[^<]*${escaped}[\\s\\S]*?<\\/h[1-6]>([\\s\\S]*?)(?=<h[1-6]\\b|$)`,
    'i'
  );
  const match = html.match(regex);
  return match ? match[1] : '';
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

async function discoverProgrammeUrls(fetchImpl = fetch) {
  const html = await fetchHtml(PROGRAMMES_URL, fetchImpl);
  const links = extractLinks(html, ({ href, text }) => {
    const url = absoluteUrl(href);
    const lowerText = text.toLowerCase();

    if (!url.startsWith(BASE_URL)) {
      return false;
    }

    if (url === PROGRAMMES_URL || url.includes('/assets/')) {
      return false;
    }

    return /(bachelor|master|doctor|diploma|foundation)/i.test(lowerText);
  });

  return [...new Set(links.map((link) => absoluteUrl(link.href)))];
}

function deriveRequirements(entryRequirementsText) {
  if (!entryRequirementsText) {
    return null;
  }

  const text = entryRequirementsText.toLowerCase();
  const requirements = {
    rawText: entryRequirementsText,
  };

  if (text.includes('muet')) {
    requirements.languageExam = 'MUET';
  }

  if (text.includes('mathematics')) {
    requirements.subjects = ['Mathematics'];
  }

  return requirements;
}

function extractModules(programmeStructureHtml) {
  return splitListItems(programmeStructureHtml).map((title, index) => ({
    title,
    sortOrder: index,
    category: 'programme-structure',
  }));
}

async function scrapeProgramme(url, fetchImpl = fetch) {
  const html = await fetchHtml(url, fetchImpl);
  const title =
    matchFirst(html, /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
    matchFirst(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ||
    matchFirst(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);

  const description =
    matchFirst(html, /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
    textFromHtml(extractSection(html, 'Programme Overview'));

  const faculty = normalizeWhitespace(
    matchFirst(html, /Faculty(?:\s*[:\-]\s*|<\/[^>]+>\s*)([\s\S]{1,200}?)(?:<|$)/i) || ''
  ) || null;

  const programmeStructureHtml = extractSection(html, 'Programme Structure');
  const entryRequirementsText = textFromHtml(extractSection(html, 'Entry Requirements'));
  const careerProspectsText = textFromHtml(extractSection(html, 'Career Prospects'));
  const durationText =
    textFromHtml(extractSection(html, 'Duration')) ||
    matchFirst(html, /(Duration\s*[:\-]\s*[^<\n]{1,120})/i);
  const intakeText =
    textFromHtml(extractSection(html, 'Intake')) ||
    matchFirst(html, /(Intake\s*[:\-]\s*[^<\n]{1,120})/i);

  const name = normalizeWhitespace(title || '');
  if (!name) {
    throw new Error(`Unable to extract course title from ${url}`);
  }

  return {
    university: {
      slug: 'university-of-malaya',
      name: 'University of Malaya',
      country: 'Malaysia',
      city: 'Kuala Lumpur',
      websiteUrl: BASE_URL,
      sourceType: 'official',
      metadata: {
        sourceDomain: 'study.um.edu.my',
      },
    },
    course: {
      code: null,
      slug: slugify(name),
      name,
      awardLevel: inferAwardLevel(name),
      faculty,
      description: description || null,
      studyMode: null,
      durationText: durationText || null,
      intakeText: intakeText || null,
      tuitionText: null,
      entryRequirements: entryRequirementsText || null,
      careerProspects: careerProspectsText || null,
      sourceUrl: url,
      requirements: deriveRequirements(entryRequirementsText),
      metadata: {
        scraper: 'um',
      },
    },
    modules: extractModules(programmeStructureHtml),
  };
}

module.exports = {
  key: 'um',
  label: 'University of Malaya',
  discoverProgrammeUrls,
  scrapeProgramme,
};
