const { sequelize, University, Course, CourseModule } = require('../models');
const umScraper = require('../scrapers/um');
const upmScraper = require('../scrapers/upm');
const ukmScraper = require('../scrapers/ukm');
const { buildUpmCourseDetail } = require('./upmCourseDetails');
const fs = require('fs/promises');
const path = require('path');

const scrapers = {
  um: umScraper,
  upm: upmScraper,
  ukm: ukmScraper,
};

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

async function importSingleCourse(scraper, url, options = {}) {
  const scraped = await scraper.scrapeProgramme(url, options);

  return sequelize.transaction(async (transaction) => {
    if (scraped.multiCourse) {
      if (!scraped.university) {
        throw new Error('Scraper did not return a university payload');
      }

      const university = await upsertUniversity(scraped.university, transaction);
      let importedCount = 0;

      for (const coursePayload of scraped.courses || []) {
        const detailPayload =
          scraper.key === 'upm' ? buildUpmCourseDetail(coursePayload.name) : null;

        const [course] = await Course.findOrCreate({
          where: { sourceUrl: coursePayload.sourceUrl },
          defaults: {
            ...coursePayload,
            durationText: detailPayload?.durationText || coursePayload.durationText,
            metadata: {
              ...(coursePayload.metadata || {}),
              ...(detailPayload?.metadata || {}),
              detailUrl: detailPayload?.detailUrl || null,
              detailSourceType: detailPayload?.detailSourceType || null,
            },
            universityId: university.id,
            lastScrapedAt: new Date(),
          },
          transaction,
        });

        await course.update(
          {
            ...coursePayload,
            durationText: detailPayload?.durationText || coursePayload.durationText,
            metadata: {
              ...(coursePayload.metadata || {}),
              ...(detailPayload?.metadata || {}),
              detailUrl: detailPayload?.detailUrl || null,
              detailSourceType: detailPayload?.detailSourceType || null,
            },
            universityId: university.id,
            lastScrapedAt: new Date(),
          },
          { transaction }
        );

        const modules = (scraped.modulesByCourseSlug || {})[coursePayload.slug] || [];
        await replaceCourseModules(course.id, modules, transaction);
        importedCount += 1;
      }

      return { importedCount };
    }

    const university = await upsertUniversity(scraped.university, transaction);
    const [course] = await Course.findOrCreate({
      where: { sourceUrl: scraped.course.sourceUrl },
      defaults: {
        ...scraped.course,
        universityId: university.id,
        lastScrapedAt: new Date(),
      },
      transaction,
    });

    await course.update(
      {
        ...scraped.course,
        universityId: university.id,
        lastScrapedAt: new Date(),
      },
      { transaction }
    );

    await replaceCourseModules(course.id, scraped.modules || [], transaction);

    return course;
  });
}

async function importUniversityCourses(scraperKey, options = {}) {
  const scraper = scrapers[scraperKey];
  if (!scraper) {
    throw new Error(`Unsupported scraper "${scraperKey}"`);
  }

  const syncOptions = process.env.DB_SYNC_ALTER === 'true' ? { alter: true } : {};
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

  const result = {
    scraper: scraperKey,
    discovered: discoveredUrls.length,
    imported: 0,
    failed: [],
    sourceOverride: options.sourceUrl || (options.sourceFile ? options.sourceFile.originalName : null),
  };

  for (const url of urls) {
    try {
      const importResult = await importSingleCourse(scraper, url, options);
      result.imported += importResult.importedCount || 1;
    } catch (error) {
      result.failed.push({ url, error: error.message });
    }
  }

  return result;
}

module.exports = {
  importUniversityCourses,
};
