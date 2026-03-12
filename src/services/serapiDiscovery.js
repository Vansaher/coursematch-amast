const { Course, University } = require('../models');

const DISCOVERY_STATUS = {
  lastRun: null,
};

const MAX_CANDIDATES = 5;
const MAX_RESULTS_PER_QUERY = 10;

function getRequiredConfig() {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    const error = new Error('SERPAPI_API_KEY is not configured');
    error.code = 'SERPAPI_MISSING_KEY';
    throw error;
  }

  return {
    apiKey,
    engine: process.env.SERPAPI_ENGINE || 'google',
    location: process.env.SERPAPI_LOCATION || 'Malaysia',
    gl: process.env.SERPAPI_GL || 'my',
    hl: process.env.SERPAPI_HL || 'en',
  };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function distinct(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildQueries(course, university) {
  const parts = [course.name, university.name];
  const faculty = course.faculty ? [course.faculty] : [];

  const queries = [
    `${parts.join(' ')} official programme`,
    `${parts.join(' ')} admission requirements site:${new URL(university.websiteUrl || `https://${university.slug}.edu.my`).hostname}`,
  ];

  if (faculty.length) {
    queries.push(`${course.name} ${faculty[0]} ${university.name}`);
  }

  return distinct(queries);
}

function getAllowedDomains(university) {
  const domains = [];

  if (university.websiteUrl) {
    try {
      const host = new URL(university.websiteUrl).hostname;
      domains.push(host);
      const withoutWww = host.replace(/^www\./, '');
      if (withoutWww !== host) {
        domains.push(withoutWww);
      }
    } catch (error) {
      // Ignore invalid stored website URLs and fall back to metadata/domain guesses.
    }
  }

  if (university.metadata && Array.isArray(university.metadata.allowedDomains)) {
    domains.push(...university.metadata.allowedDomains);
  }

  if (university.metadata && university.metadata.sourceDomain) {
    domains.push(university.metadata.sourceDomain);
  }

  return distinct(domains.map((domain) => String(domain).toLowerCase()));
}

function isAllowedDomain(hostname, allowedDomains) {
  const lower = String(hostname || '').toLowerCase();
  return allowedDomains.some((domain) => lower === domain || lower.endsWith(`.${domain}`));
}

function buildProgrammePatterns(course, university) {
  const courseTokens = normalizeSlug(course.name).split(' ').filter(Boolean);
  const strongTokens = courseTokens.filter((token) => token.length > 3);
  const universityTokens = normalizeSlug(university.name).split(' ').filter(Boolean);

  return {
    courseTokens,
    strongTokens,
    universityTokens,
  };
}

function scoreResult(result, course, university, allowedDomains) {
  let url;
  try {
    url = new URL(result.link);
  } catch (error) {
    return null;
  }

  if (!isAllowedDomain(url.hostname, allowedDomains)) {
    return null;
  }

  const combinedText = `${result.title || ''} ${result.snippet || ''} ${url.pathname}`.toLowerCase();
  const patterns = buildProgrammePatterns(course, university);
  const reasons = [];
  let score = 0;

  const exactHostMatch = allowedDomains.includes(url.hostname.toLowerCase());
  if (exactHostMatch) {
    score += 40;
    reasons.push('exact official domain');
  } else {
    score += 30;
    reasons.push('official subdomain');
  }

  const strongMatches = patterns.strongTokens.filter((token) => combinedText.includes(token));
  if (strongMatches.length) {
    score += strongMatches.length * 8;
    reasons.push(`programme tokens matched: ${strongMatches.join(', ')}`);
  }

  const universityMatches = patterns.universityTokens.filter((token) => combinedText.includes(token));
  if (universityMatches.length) {
    score += 5;
    reasons.push('university name matched');
  }

  if (/(programme|program|admission|entry|requirements|curriculum|syllabus|handbook)/i.test(combinedText)) {
    score += 18;
    reasons.push('detail/admission signal');
  }

  if (/\.pdf$/i.test(url.pathname)) {
    score += 10;
    reasons.push('official pdf');
  }

  if (/(news|berita|events|event|announcement|home|index)/i.test(combinedText)) {
    score -= 25;
    reasons.push('generic/news signal');
  }

  if (url.pathname === '/' || url.pathname === '') {
    score -= 20;
    reasons.push('homepage-only result');
  }

  return {
    title: result.title || url.toString(),
    url: url.toString(),
    snippet: result.snippet || '',
    sourceDomain: url.hostname,
    score,
    whySelected: reasons.join('; '),
  };
}

async function querySerapi(query, config) {
  const searchParams = new URLSearchParams({
    api_key: config.apiKey,
    engine: config.engine,
    q: query,
    google_domain: 'google.com',
    gl: config.gl,
    hl: config.hl,
    location: config.location,
    num: String(MAX_RESULTS_PER_QUERY),
  });

  const response = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error(`SerAPI request failed with ${response.status}`);
  }

  const payload = await response.json();
  return payload.organic_results || [];
}

function mergeCandidates(scoredResults) {
  const byUrl = new Map();

  for (const result of scoredResults) {
    const existing = byUrl.get(result.url);
    if (!existing || existing.score < result.score) {
      byUrl.set(result.url, result);
    }
  }

  return [...byUrl.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, MAX_CANDIDATES);
}

async function discoverCourseSources(course, university) {
  const config = getRequiredConfig();
  const queries = buildQueries(course, university);
  const allowedDomains = getAllowedDomains(university);
  const rawCandidates = [];

  for (const query of queries) {
    const results = await querySerapi(query, config);
    const scored = results
      .map((result) => scoreResult(result, course, university, allowedDomains))
      .filter(Boolean);

    rawCandidates.push(...scored);
  }

  const candidates = mergeCandidates(rawCandidates);
  return {
    lastRunAt: new Date().toISOString(),
    queries,
    primaryCandidate: candidates[0] || null,
    candidates,
  };
}

function mergeMetadata(course, discovery) {
  return {
    ...(course.metadata || {}),
    discovery: {
      ...((course.metadata && course.metadata.discovery) || {}),
      serapi: discovery,
    },
  };
}

async function runDiscoveryForCourseId(courseId) {
  const course = await Course.findByPk(courseId, {
    include: [{ model: University, as: 'university' }],
  });

  if (!course) {
    const error = new Error('Course not found');
    error.code = 'COURSE_NOT_FOUND';
    throw error;
  }

  if (!course.university) {
    const error = new Error('Course has no linked university');
    error.code = 'COURSE_NO_UNIVERSITY';
    throw error;
  }

  const discovery = await discoverCourseSources(course, course.university);
  const metadata = mergeMetadata(course, discovery);
  await course.update({ metadata });

  return {
    courseId: course.id,
    courseName: course.name,
    updated: Boolean(discovery.primaryCandidate),
    skipped: !discovery.primaryCandidate,
    discovery,
  };
}

async function runDiscoveryBatch(filters = {}) {
  getRequiredConfig();

  const where = {};
  if (filters.universityId) {
    where.universityId = filters.universityId;
  }
  if (filters.courseId) {
    where.id = filters.courseId;
  }

  const courses = await Course.findAll({
    where,
    include: [{ model: University, as: 'university' }],
    order: [['id', 'ASC']],
  });

  const filteredCourses = filters.scraperKey
    ? courses.filter(
        (course) => course.metadata && course.metadata.scraper === filters.scraperKey
      )
    : courses;
  const limit = Number(filters.limit || filteredCourses.length);
  const selectedCourses = filteredCourses.slice(0, limit);
  const result = {
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    items: [],
    filters,
    lastRunAt: new Date().toISOString(),
  };

  for (const course of selectedCourses) {
    result.processed += 1;
    try {
      const item = await runDiscoveryForCourseId(course.id);
      result.items.push(item);
      if (item.updated) {
        result.updated += 1;
      } else {
        result.skipped += 1;
      }
    } catch (error) {
      result.failed += 1;
      result.failures.push({
        courseId: course.id,
        courseName: course.name,
        error: error.message,
      });
    }
  }

  DISCOVERY_STATUS.lastRun = result;
  return result;
}

function getDiscoveryStatus() {
  return DISCOVERY_STATUS.lastRun || {
    processed: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    failures: [],
    items: [],
    lastRunAt: null,
  };
}

module.exports = {
  buildQueries,
  getAllowedDomains,
  scoreResult,
  discoverCourseSources,
  runDiscoveryForCourseId,
  runDiscoveryBatch,
  getDiscoveryStatus,
};
