const { PDFParse } = require('pdf-parse');
const { matchFirst, normalizeWhitespace, textFromHtml } = require('../scrapers/utils/html');
const { normalizeMalaysianProgrammeName } = require('./upmCourseDetails');

function isPdfUrl(url) {
  return /\.pdf(?:$|[?#])/i.test(String(url || ''));
}

function normalizeSearchText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/bacelor/g, 'bachelor')
    .replace(/dengan kepujian/g, 'with honours')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function courseTokens(courseName = '') {
  return normalizeSearchText(courseName)
    .split(' ')
    .filter((token) => token.length > 3)
    .filter((token) => !['bachelor', 'with', 'honours'].includes(token));
}

function chooseBestParagraph(paragraphs, courseName) {
  const tokens = courseTokens(courseName);
  if (!tokens.length) {
    return null;
  }

  let best = null;
  for (const paragraph of paragraphs) {
    const normalized = normalizeSearchText(paragraph);
    const score = tokens.reduce((sum, token) => sum + (normalized.includes(token) ? 1 : 0), 0);
    if (!best || score > best.score) {
      best = { paragraph, score };
    }
  }

  return best && best.score > 0 ? best.paragraph : null;
}

function splitParagraphs(text = '') {
  return String(text || '')
    .split(/\n{2,}/)
    .map((value) => normalizeWhitespace(value))
    .filter((value) => value.length > 40);
}

function parseDuration(text = '') {
  return (
    matchFirst(text, /\b((?:\d+)\s+semesters?\s*\/\s*(?:\d+)\s+years?)\b/i) ||
    matchFirst(text, /\b((?:\d+)\s+years?(?:\s+\d+\s+months?)?)\b/i) ||
    matchFirst(text, /\b(Tempoh\s+pengajian[^.\n]{0,80})/i) ||
    null
  );
}

function extractRequirementBlock(text = '') {
  const match = String(text || '').match(
    /(entry requirements?|admission requirements?|syarat kemasukan)([\s\S]{0,1200})(?=(career|prospects|fees|duration|struktur|programme structure|$))/i
  );
  return match ? normalizeWhitespace(match[0]) : null;
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

  const subjects = [];
  for (const subject of ['Mathematics', 'Physics', 'Chemistry', 'Biology']) {
    if (text.includes(subject.toLowerCase())) {
      subjects.push(subject);
    }
  }

  if (subjects.length) {
    requirements.subjects = subjects;
  }

  return requirements;
}

function isTemplateDescription(description = '', courseName = '', faculty = '') {
  const normalizedDescription = normalizeWhitespace(description).toLowerCase();
  const template = normalizeWhitespace(`${courseName} offered by ${faculty} at Universiti Putra Malaysia.`).toLowerCase();
  return normalizedDescription === template;
}

async function fetchTextDocument(url, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    headers: {
      'user-agent': 'course-matching-bot/1.0 (+academic project)',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  if (isPdfUrl(url)) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return {
        type: 'pdf',
        title: null,
        text: String(result.text || ''),
      };
    } finally {
      await parser.destroy();
    }
  }

  const html = await response.text();
  return {
    type: 'html',
    title:
      matchFirst(html, /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      matchFirst(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i) ||
      null,
    text: textFromHtml(html),
  };
}

function extractDescription(text, coursePayload) {
  const paragraphs = splitParagraphs(text);
  const best = chooseBestParagraph(paragraphs, coursePayload.name);
  if (!best) {
    return null;
  }

  const normalizedBest = normalizeWhitespace(best);
  if (normalizeSearchText(normalizedBest) === normalizeSearchText(coursePayload.name)) {
    return null;
  }

  return normalizedBest;
}

async function extractUpmDetail(detailPayload, coursePayload, options = {}) {
  if (!detailPayload?.detailUrl) {
    return null;
  }

  const cache = options.detailDocumentCache || new Map();
  let documentPromise = cache.get(detailPayload.detailUrl);
  if (!documentPromise) {
    documentPromise = fetchTextDocument(detailPayload.detailUrl, options);
    cache.set(detailPayload.detailUrl, documentPromise);
  }

  const document = await documentPromise;
  const fullText = String(document.text || '');
  const extractedDescription = extractDescription(fullText, coursePayload);
  const extractedRequirements = extractRequirementBlock(fullText);
  const extractedDuration = parseDuration(fullText);

  return {
    description:
      extractedDescription &&
      (isTemplateDescription(coursePayload.description, coursePayload.name, coursePayload.faculty) ||
        extractedDescription.length > String(coursePayload.description || '').length)
        ? extractedDescription
        : null,
    durationText: extractedDuration || null,
    entryRequirements: extractedRequirements || null,
    requirements: extractedRequirements ? deriveRequirements(extractedRequirements) : null,
    metadata: {
      detailUrl: detailPayload.detailUrl,
      detailSourceType: detailPayload.detailSourceType,
      detailExtracted: true,
      detailExtractedFromType: document.type,
      detailExtractedTitle: document.title,
    },
  };
}

module.exports = {
  extractUpmDetail,
};
