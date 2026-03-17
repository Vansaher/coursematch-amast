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

    const baseCoursePayload = {
      ...coursePayload,
      description: extractedDetail?.description || coursePayload.description,
      durationText: extractedDetail?.durationText || detailPayload?.durationText || coursePayload.durationText,
      entryRequirements: extractedDetail?.entryRequirements || coursePayload.entryRequirements,
      requirements: extractedDetail?.requirements || coursePayload.requirements,
      metadata: mergeCourseMetadata(coursePayload.metadata, detailPayload, extractedDetail),
    };

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
  const course = await maybeEnrichCoursePayload(scraped.course, scraped.university, options);
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
        metadata: {
          detailUrl: record.course.metadata?.detailUrl || null,
          detailSourceType: record.course.metadata?.detailSourceType || null,
        },
      };
    }),
  };
}

async function applyPreparedImport(prepared, options = {}) {
  const selectedSourceUrls = new Set(
    Array.isArray(options.selectedCourseSourceUrls) ? options.selectedCourseSourceUrls.map((value) => String(value)) : []
  );
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
      if (shouldFilter && !selectedSourceUrls.has(String(record.course.sourceUrl))) {
        continue;
      }

      const [course] = await Course.findOrCreate({
        where: { sourceUrl: record.course.sourceUrl },
        defaults: {
          ...record.course,
          universityId: university.id,
          lastScrapedAt: new Date(),
        },
        transaction,
      });

      await course.update(
        {
          ...record.course,
          universityId: university.id,
          lastScrapedAt: new Date(),
        },
        { transaction }
      );

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
