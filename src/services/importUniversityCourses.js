const { Op } = require('sequelize');
const { sequelize, University, Course, CourseModule } = require('../models');
const umScraper = require('../scrapers/um');
const upmScraper = require('../scrapers/upm');
const ukmScraper = require('../scrapers/ukm');
const usmScraper = require('../scrapers/usm');
const utmScraper = require('../scrapers/utm');
const uumScraper = require('../scrapers/uum');
const { buildUpmCourseDetail } = require('./upmCourseDetails');
const { discoverUpmCourseDetails } = require('./upmDetailDiscovery');
const { extractUpmDetail } = require('./upmDetailExtractor');
const { enrichCourseDetails, isQwenConfigured } = require('./qwenCourseEnrichment');
const {
  normalizeGeneralEntryRequirements,
  buildCombinedEntryRequirements,
} = require('./qwenGeneralEntryRequirements');
const fs = require('fs/promises');
const path = require('path');

const scrapers = {
  um: umScraper,
  upm: upmScraper,
  ukm: ukmScraper,
  usm: usmScraper,
  utm: utmScraper,
  uum: uumScraper,
};

function reportProgress(options = {}, patch = {}) {
  if (typeof options.onProgress === 'function') {
    options.onProgress(patch);
  }
}

async function upsertUniversity(universityPayload, transaction) {
  const [university] = await University.findOrCreate({
    where: { slug: universityPayload.slug },
    defaults: universityPayload,
    transaction,
  });

  await university.update(universityPayload, { transaction });
  return university;
}

async function replaceCourseModules(courseId, modules, transaction) {
  await CourseModule.destroy({
    where: { courseId },
    transaction,
  });

  if (!modules.length) {
    return;
  }

  await CourseModule.bulkCreate(
    modules.map((moduleItem, index) => ({
      courseId,
      yearLabel: moduleItem.yearLabel || null,
      termLabel: moduleItem.termLabel || null,
      category: moduleItem.category || null,
      code: moduleItem.code || null,
      title: moduleItem.title,
      credits: moduleItem.credits || null,
      sortOrder: moduleItem.sortOrder ?? index,
      metadata: moduleItem.metadata || null,
    })),
    { transaction }
  );
}

function parseBooleanOption(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function hasCourseSpecificEntryRequirements(coursePayload = {}) {
  const requirements = coursePayload.requirements || {};
  return Boolean(
    normalizeTextBlock(coursePayload.entryRequirements) ||
      (Array.isArray(requirements.subjects) && requirements.subjects.length) ||
      normalizeTextBlock(requirements.languageExam) ||
      normalizeTextBlock(requirements.minAverage)
  );
}

function normalizeTextBlock(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function mergeRequirementSubjects(existingSubjects = [], fallbackSubjects = []) {
  const seen = new Set();
  return [...existingSubjects, ...fallbackSubjects].filter((item) => {
    const key =
      typeof item === 'string'
        ? normalizeTextBlock(item).toLowerCase()
        : normalizeTextBlock(item?.name || item?.subject || '').toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function applyGeneralEntryRequirementFallback(coursePayload, options = {}) {
  const generalRequirements = options.generalEntryRequirements;
  if (!generalRequirements || hasCourseSpecificEntryRequirements(coursePayload)) {
    return coursePayload;
  }

  const combinedEntryRequirements = buildCombinedEntryRequirements(generalRequirements);
  if (!combinedEntryRequirements) {
    return coursePayload;
  }

  const stpm = generalRequirements.stpm || null;
  const existingRequirements = coursePayload.requirements || {};

  return {
    ...coursePayload,
    entryRequirements: combinedEntryRequirements,
    requirements: {
      ...existingRequirements,
      subjects: mergeRequirementSubjects(existingRequirements.subjects || [], stpm?.structuredRequirements?.subjects || []),
      languageExam: existingRequirements.languageExam || stpm?.structuredRequirements?.languageExam || null,
      pathways: generalRequirements,
    },
    metadata: {
      ...(coursePayload.metadata || {}),
      generalEntryRequirementsApplied: true,
      generalEntryRequirements: generalRequirements,
    },
  };
}

function normalizeImportedCourseName(name = '') {
  const value = normalizeTextBlock(name);
  if (!value) {
    return value;
  }

  const honoursMatch = value.match(/^(.*?\b(with honours|with honor|dengan kepujian)\b)/i);
  if (honoursMatch) {
    return normalizeTextBlock(honoursMatch[1]);
  }

  const cutoffPatterns = [/\s+\bis\b\s+/i, /\s+offered by\s+/i, /\s+yang\s+/i];
  for (const pattern of cutoffPatterns) {
    const parts = value.split(pattern);
    if (parts.length > 1) {
      return normalizeTextBlock(parts[0]);
    }
  }

  return value;
}

function maybeNormalizeCourseName(coursePayload, options = {}) {
  if (!parseBooleanOption(options.normalizeCourseName, false)) {
    return coursePayload;
  }

  const normalizedName = normalizeImportedCourseName(coursePayload.name);
  return {
    ...coursePayload,
    name: normalizedName || coursePayload.name,
    metadata: {
      ...(coursePayload.metadata || {}),
      originalImportedName: coursePayload.name,
      courseNameNormalized: normalizedName !== coursePayload.name,
    },
  };
}

async function maybeEnrichCoursePayload(coursePayload, universityPayload, options = {}) {
  if (!parseBooleanOption(options.qwenEnrich, parseBooleanOption(process.env.IMPORT_QWEN_ENRICHMENT_DEFAULT, false))) {
    return coursePayload;
  }

  if (!isQwenConfigured()) {
    return {
      ...coursePayload,
      metadata: {
        ...(coursePayload.metadata || {}),
        qwenEnrichmentSkipped: 'QWEN_API_KEY is not configured',
      },
    };
  }

  try {
    const enriched = await enrichCourseDetails(coursePayload, universityPayload, {
      extractedDescription: options.extractedDescription,
      extractedDurationText: options.extractedDurationText,
      extractedEntryRequirements: options.extractedEntryRequirements,
      detailUrl: options.detailUrl,
      detailSourceType: options.detailSourceType,
    });
    if (!enriched) {
      return coursePayload;
    }

    return {
      ...coursePayload,
      name: coursePayload.name,
      faculty: coursePayload.faculty,
      description: enriched.description || coursePayload.description,
      studyMode: enriched.studyMode || coursePayload.studyMode,
      durationText: enriched.durationText || coursePayload.durationText,
      entryRequirements: enriched.entryRequirements || coursePayload.entryRequirements,
      careerProspects: enriched.careerProspects || coursePayload.careerProspects,
      requirements: enriched.requirements || coursePayload.requirements,
      metadata: {
        ...(coursePayload.metadata || {}),
        scrapedText: {
          name: coursePayload.name,
          faculty: coursePayload.faculty,
          description: coursePayload.description,
        },
        generatedCourseOverview: {
          field: enriched.field,
          whatYouStudy: enriched.whatYouStudy,
          skillsGained: enriched.skillsGained,
          sourceMode: enriched.sourceMode,
        },
        qwenEnriched: true,
        qwenEnrichmentModel: enriched.model,
      },
    };
  } catch (error) {
    return {
      ...coursePayload,
      metadata: {
        ...(coursePayload.metadata || {}),
        qwenEnrichmentError: error.message,
      },
    };
  }
}

function mergeCourseMetadata(baseMetadata, detailPayload, extractedDetail) {
  return {
    ...(baseMetadata || {}),
    ...(detailPayload?.metadata || {}),
    ...(extractedDetail?.metadata || {}),
    detailUrl: detailPayload?.detailUrl || null,
    detailSourceType: detailPayload?.detailSourceType || null,
  };
}

function buildComparableMetadata(course) {
  return {
    detailUrl: course.metadata?.detailUrl || null,
    detailSourceType: course.metadata?.detailSourceType || null,
  };
}

async function buildPreparedMultiCourseRecords(scraper, scraped, options = {}) {
  const records = [];
  let enrichedCount = 0;
  const detailDocumentCache = new Map();
  const totalCourses = Array.isArray(scraped.courses) ? scraped.courses.length : 0;
  let preparedCourses = 0;
  const upmDiscoveredDetails =
    scraper.key === 'upm' ? await discoverUpmCourseDetails(scraped.courses || [], options) : new Map();

  for (const coursePayload of scraped.courses || []) {
    reportProgress(options, {
      stage: 'preparing_courses',
      message: `Preparing ${coursePayload.name}`,
      counters: {
        totalCourses,
        preparedCourses,
      },
    });

    const detailPayload =
      scraper.key === 'upm'
        ? upmDiscoveredDetails.get(coursePayload.name) || buildUpmCourseDetail(coursePayload.name)
        : null;
    const extractedDetail =
      scraper.key === 'upm' && detailPayload?.detailUrl
        ? await extractUpmDetail(detailPayload, coursePayload, {
            ...options,
            detailDocumentCache,
          })
        : null;

    const baseCoursePayload = applyGeneralEntryRequirementFallback(maybeNormalizeCourseName({
      ...coursePayload,
      description: extractedDetail?.description || coursePayload.description,
      durationText: extractedDetail?.durationText || detailPayload?.durationText || coursePayload.durationText,
      entryRequirements: extractedDetail?.entryRequirements || coursePayload.entryRequirements,
      requirements: extractedDetail?.requirements || coursePayload.requirements,
      metadata: mergeCourseMetadata(coursePayload.metadata, detailPayload, extractedDetail),
    }, options), options);

    const detailedCoursePayload = await maybeEnrichCoursePayload(
      baseCoursePayload,
      scraped.university,
      {
        ...options,
        extractedDescription: extractedDetail?.description || null,
        extractedDurationText: extractedDetail?.durationText || detailPayload?.durationText || null,
        extractedEntryRequirements: extractedDetail?.entryRequirements || null,
        detailUrl: detailPayload?.detailUrl || null,
        detailSourceType: detailPayload?.detailSourceType || null,
      }
    );

    if (detailedCoursePayload.metadata?.qwenEnriched) {
      enrichedCount += 1;
    }

    records.push({
      course: {
        ...detailedCoursePayload,
        metadata: mergeCourseMetadata(detailedCoursePayload.metadata, detailPayload, extractedDetail),
      },
      modules: (scraped.modulesByCourseSlug || {})[coursePayload.slug] || [],
    });
    preparedCourses += 1;
    reportProgress(options, {
      stage: 'preparing_courses',
      message: `Prepared ${coursePayload.name}`,
      counters: {
        totalCourses,
        preparedCourses,
        enrichedCourses: enrichedCount,
      },
    });
  }

  return {
    university: scraped.university,
    records,
    enrichedCount,
  };
}

async function buildPreparedSingleCourseRecord(scraper, scraped, options = {}) {
  const course = await maybeEnrichCoursePayload(
    applyGeneralEntryRequirementFallback(maybeNormalizeCourseName(scraped.course, options), options),
    scraped.university,
    options
  );
  return {
    university: scraped.university,
    records: [
      {
        course,
        modules: scraped.modules || [],
      },
    ],
    enrichedCount: course.metadata?.qwenEnriched ? 1 : 0,
  };
}

async function buildPreparedImport(scraper, url, options = {}) {
  reportProgress(options, {
    stage: 'scraping_page',
    message: `Scraping ${url}`,
  });
  const scraped = await scraper.scrapeProgramme(url, options);
  reportProgress(options, {
    stage: 'scraping_page',
    message: `Scraped ${url}`,
  });
  if (scraped.multiCourse) {
    return buildPreparedMultiCourseRecords(scraper, scraped, options);
  }
  return buildPreparedSingleCourseRecord(scraper, scraped, options);
}

function comparableCourse(course) {
  return {
    name: course.name || null,
    faculty: course.faculty || null,
    description: course.description || null,
    studyMode: course.studyMode || null,
    durationText: course.durationText || null,
    entryRequirements: course.entryRequirements || null,
    detailUrl: course.metadata?.detailUrl || null,
    detailSourceType: course.metadata?.detailSourceType || null,
  };
}

function diffFields(previous, next) {
  const changedFields = [];
  for (const key of Object.keys(next)) {
    if ((previous?.[key] || null) !== (next?.[key] || null)) {
      changedFields.push(key);
    }
  }
  return changedFields;
}

async function previewSingleCourseImport(scraper, url, options = {}) {
  const prepared = await buildPreparedImport(scraper, url, options);
  reportProgress(options, {
    stage: 'comparing',
    message: `Comparing imported data with current database for ${url}`,
  });
  const sourceUrls = prepared.records.map((record) => record.course.sourceUrl);
  const existingCourses = await Course.findAll({
    where: {
      sourceUrl: {
        [Op.in]: sourceUrls,
      },
    },
  });
  const existingBySourceUrl = new Map(existingCourses.map((course) => [course.sourceUrl, course]));

  return {
    importedCount: prepared.records.length,
    enrichedCount: prepared.enrichedCount,
    comparisons: prepared.records.map((record) => {
      const existing = existingBySourceUrl.get(record.course.sourceUrl);
      const oldCourse = existing ? comparableCourse(existing.toJSON()) : null;
      const newCourse = comparableCourse(record.course);
      const changedFields = diffFields(oldCourse || {}, newCourse);
      return {
        id: record.course.sourceUrl,
        action: existing ? (changedFields.length ? 'update' : 'unchanged') : 'create',
        selectedByDefault: !existing || changedFields.length > 0,
        changedFields,
        oldCourse,
        newCourse,
        displayName: record.course.name,
        universityName: prepared.university?.name || null,
        deletable: Boolean(existing),
        metadata: {
          detailUrl: record.course.metadata?.detailUrl || null,
          detailSourceType: record.course.metadata?.detailSourceType || null,
        },
      };
    }),
  };
}

async function applyPreparedImport(prepared, options = {}) {
  const selectedOperations = new Map(
    Array.isArray(options.selectedCourseOperations)
      ? options.selectedCourseOperations
          .filter((item) => item && item.id)
          .map((item) => [String(item.id), item])
      : []
  );
  const selectedSourceUrls = new Set(selectedOperations.keys());
  const shouldFilter = selectedSourceUrls.size > 0;

  return sequelize.transaction(async (transaction) => {
    reportProgress(options, {
      stage: 'writing_database',
      message: `Upserting ${prepared.university?.name || 'university'} and selected courses`,
      counters: {
        totalCoursesToWrite: shouldFilter ? selectedSourceUrls.size : prepared.records.length,
        writtenCourses: 0,
      },
    });
    const university = await upsertUniversity(prepared.university, transaction);
    let importedCount = 0;

    for (const record of prepared.records) {
      const sourceUrl = String(record.course.sourceUrl);
      if (shouldFilter && !selectedSourceUrls.has(sourceUrl)) {
        continue;
      }

      const operation = selectedOperations.get(sourceUrl) || {};
      const selectedFields = Array.isArray(operation.fields) ? operation.fields : [];
      const shouldDelete = Boolean(operation.delete);

      const existing = await Course.findOne({
        where: { sourceUrl: record.course.sourceUrl },
        transaction,
      });

      if (shouldDelete) {
        if (existing) {
          await CourseModule.destroy({
            where: { courseId: existing.id },
            transaction,
          });
          await existing.destroy({ transaction });
          importedCount += 1;
          reportProgress(options, {
            stage: 'writing_database',
            message: `Deleted ${existing.name}`,
            counters: {
              totalCoursesToWrite: shouldFilter ? selectedSourceUrls.size : prepared.records.length,
              writtenCourses: importedCount,
            },
          });
        }
        continue;
      }

      const defaults = {
        ...record.course,
        universityId: university.id,
        lastScrapedAt: new Date(),
      };
      const [course] = existing
        ? [existing]
        : await Course.findOrCreate({
            where: { sourceUrl: record.course.sourceUrl },
            defaults,
            transaction,
          });

      const metadata = {
        ...(course.metadata || {}),
        ...(record.course.metadata || {}),
      };
      if (!selectedFields.length || selectedFields.includes('detailUrl') || selectedFields.includes('detailSourceType')) {
        metadata.detailUrl = record.course.metadata?.detailUrl || null;
        metadata.detailSourceType = record.course.metadata?.detailSourceType || null;
      }

      const directFieldPatch = shouldFilter && existing
        ? Object.fromEntries(
            ['name', 'faculty', 'description', 'studyMode', 'durationText', 'entryRequirements']
              .filter((field) => selectedFields.includes(field))
              .map((field) => [field, record.course[field]])
          )
        : {
            name: record.course.name,
            faculty: record.course.faculty,
            description: record.course.description,
            studyMode: record.course.studyMode,
            durationText: record.course.durationText,
            entryRequirements: record.course.entryRequirements,
          };

      const updatePayload =
        existing && shouldFilter && selectedFields.length
          ? {
              ...directFieldPatch,
              metadata,
              universityId: university.id,
              lastScrapedAt: new Date(),
            }
          : {
              ...record.course,
              metadata,
              universityId: university.id,
              lastScrapedAt: new Date(),
            };

      await course.update(updatePayload, { transaction });

      await replaceCourseModules(course.id, record.modules || [], transaction);
      importedCount += 1;
      reportProgress(options, {
        stage: 'writing_database',
        message: `Saved ${record.course.name}`,
        counters: {
          totalCoursesToWrite: shouldFilter ? selectedSourceUrls.size : prepared.records.length,
          writtenCourses: importedCount,
        },
      });
    }

    return {
      importedCount,
      enrichedCount: prepared.enrichedCount,
    };
  });
}

async function importSingleCourse(scraper, url, options = {}) {
  const prepared = await buildPreparedImport(scraper, url, options);

  if (!prepared.university) {
    throw new Error('Scraper did not return a university payload');
  }

  return applyPreparedImport(prepared, options);
}

async function importUniversityCourses(scraperKey, options = {}) {
  const scraper = scrapers[scraperKey];
  if (!scraper) {
    throw new Error(`Unsupported scraper "${scraperKey}"`);
  }

  const syncOptions = process.env.DB_SYNC_ALTER === 'true' ? { alter: true } : {};
  reportProgress(options, {
    stage: 'initializing',
    message: `Initializing importer for ${scraperKey.toUpperCase()}`,
    progress: 2,
  });
  await sequelize.sync(syncOptions);
  reportProgress(options, {
    stage: 'normalizing_general_requirements',
    message: 'Normalizing general entry requirements',
    progress: 4,
  });
  const generalEntryRequirements = await normalizeGeneralEntryRequirements({
    stpm: options.generalRequirementStpm,
    matriculation: options.generalRequirementMatriculation,
    diplomaEquivalent: options.generalRequirementDiplomaEquivalent,
  });
  options.generalEntryRequirements = generalEntryRequirements;

  let discoveredUrls;
  if (options.sourceUrl) {
    discoveredUrls = [options.sourceUrl];
  } else if (options.sourceFile) {
    const extension = path.extname(options.sourceFile.originalName || '').toLowerCase();
    if (extension === '.csv') {
      const csvContent = await fs.readFile(options.sourceFile.path, 'utf8');
      discoveredUrls = [...new Set(
        csvContent
          .split(/\r?\n/)
          .flatMap((line) => line.split(','))
          .map((value) => value.trim())
          .filter((value) => /^https?:\/\//i.test(value))
      )];
      if (!discoveredUrls.length) {
        throw new Error('CSV upload did not contain any valid http/https URLs');
      }
    } else if (extension === '.pdf') {
      throw new Error('PDF import source is not implemented yet. Use a URL or CSV of URLs.');
    } else {
      throw new Error('Unsupported upload type. Use a CSV of URLs or a direct URL.');
    }
  } else {
    discoveredUrls = await scraper.discoverProgrammeUrls(options);
  }
  const limit = Number(options.limit || process.env.SCRAPER_LIMIT || discoveredUrls.length);
  const urls = discoveredUrls.slice(0, limit);
  reportProgress(options, {
    stage: 'discovering_urls',
    message: `Discovered ${discoveredUrls.length} URL(s), processing ${urls.length}`,
    counters: {
      totalUrls: urls.length,
      processedUrls: 0,
    },
    progress: 5,
  });

  const result = {
    scraper: scraperKey,
    discovered: discoveredUrls.length,
    imported: 0,
    enriched: 0,
    failed: [],
    sourceOverride: options.sourceUrl || (options.sourceFile ? options.sourceFile.originalName : null),
    qwenEnrich: parseBooleanOption(
      options.qwenEnrich,
      parseBooleanOption(process.env.IMPORT_QWEN_ENRICHMENT_DEFAULT, false)
    ),
  };
  let processedUrls = 0;

  for (const url of urls) {
    try {
      reportProgress(options, {
        stage: 'processing_url',
        message: `Processing ${url}`,
      });
      const importResult = await importSingleCourse(scraper, url, options);
      result.imported += importResult.importedCount || 1;
      result.enriched += importResult.enrichedCount || 0;
    } catch (error) {
      result.failed.push({ url, error: error.message });
    }
    processedUrls += 1;
    reportProgress(options, {
      stage: 'processing_url',
      message: `Processed ${url}`,
      counters: {
        totalUrls: urls.length,
        processedUrls,
        importedCourses: result.imported,
        enrichedCourses: result.enriched,
        failedUrls: result.failed.length,
      },
      progress: urls.length
        ? Math.min(95, 5 + Math.round((processedUrls / urls.length) * 85))
        : 95,
    });
  }

  return result;
}

async function previewUniversityCourses(scraperKey, options = {}) {
  const scraper = scrapers[scraperKey];
  if (!scraper) {
    throw new Error(`Unsupported scraper "${scraperKey}"`);
  }

  const syncOptions = process.env.DB_SYNC_ALTER === 'true' ? { alter: true } : {};
  reportProgress(options, {
    stage: 'initializing',
    message: `Initializing preview for ${scraperKey.toUpperCase()}`,
    progress: 2,
  });
  await sequelize.sync(syncOptions);
  reportProgress(options, {
    stage: 'normalizing_general_requirements',
    message: 'Normalizing general entry requirements',
    progress: 4,
  });
  const generalEntryRequirements = await normalizeGeneralEntryRequirements({
    stpm: options.generalRequirementStpm,
    matriculation: options.generalRequirementMatriculation,
    diplomaEquivalent: options.generalRequirementDiplomaEquivalent,
  });
  options.generalEntryRequirements = generalEntryRequirements;

  let discoveredUrls;
  if (options.sourceUrl) {
    discoveredUrls = [options.sourceUrl];
  } else if (options.sourceFile) {
    const extension = path.extname(options.sourceFile.originalName || '').toLowerCase();
    if (extension === '.csv') {
      const csvContent = await fs.readFile(options.sourceFile.path, 'utf8');
      discoveredUrls = [...new Set(
        csvContent
          .split(/\r?\n/)
          .flatMap((line) => line.split(','))
          .map((value) => value.trim())
          .filter((value) => /^https?:\/\//i.test(value))
      )];
      if (!discoveredUrls.length) {
        throw new Error('CSV upload did not contain any valid http/https URLs');
      }
    } else if (extension === '.pdf') {
      throw new Error('PDF import source is not implemented yet. Use a URL or CSV of URLs.');
    } else {
      throw new Error('Unsupported upload type. Use a CSV of URLs or a direct URL.');
    }
  } else {
    discoveredUrls = await scraper.discoverProgrammeUrls(options);
  }

  const limit = Number(options.limit || process.env.SCRAPER_LIMIT || discoveredUrls.length);
  const urls = discoveredUrls.slice(0, limit);
  reportProgress(options, {
    stage: 'discovering_urls',
    message: `Discovered ${discoveredUrls.length} URL(s), previewing ${urls.length}`,
    counters: {
      totalUrls: urls.length,
      processedUrls: 0,
    },
    progress: 5,
  });

  const preview = {
    scraper: scraperKey,
    discovered: discoveredUrls.length,
    totalUrls: urls.length,
    qwenEnrich: parseBooleanOption(
      options.qwenEnrich,
      parseBooleanOption(process.env.IMPORT_QWEN_ENRICHMENT_DEFAULT, false)
    ),
    changes: [],
    failed: [],
  };
  let processedUrls = 0;

  for (const url of urls) {
    try {
      const result = await previewSingleCourseImport(scraper, url, options);
      preview.changes.push(...result.comparisons);
    } catch (error) {
      preview.failed.push({ url, error: error.message });
    }
    processedUrls += 1;
    reportProgress(options, {
      stage: 'previewing',
      message: `Previewed ${url}`,
      counters: {
        totalUrls: urls.length,
        processedUrls,
        previewChanges: preview.changes.length,
        failedUrls: preview.failed.length,
      },
      progress: urls.length
        ? Math.min(95, 5 + Math.round((processedUrls / urls.length) * 85))
        : 95,
    });
  }

  preview.summary = {
    create: preview.changes.filter((item) => item.action === 'create').length,
    update: preview.changes.filter((item) => item.action === 'update').length,
    unchanged: preview.changes.filter((item) => item.action === 'unchanged').length,
  };

  return preview;
}

module.exports = {
  importUniversityCourses,
  previewUniversityCourses,
};
