const { importUniversityCourses } = require('../services/importUniversityCourses');
const { sequelize } = require('../models');

async function main() {
  const scraperKey = process.argv[2] || 'upm';
  const args = process.argv.slice(3);
  const limitArg = args.find((value) => /^\d+$/.test(value));
  const limit = limitArg ? Number(limitArg) : undefined;
  const qwenEnrich = args.includes('--qwen-enrich')
    ? true
    : args.includes('--no-qwen-enrich')
      ? false
      : undefined;

  const result = await importUniversityCourses(scraperKey, { limit, qwenEnrich });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
