const { importUniversityCourses } = require('../services/importUniversityCourses');
const { sequelize } = require('../models');

async function main() {
  const scraperKey = process.argv[2] || 'upm';
  const limitArg = process.argv[3];
  const limit = limitArg ? Number(limitArg) : undefined;

  const result = await importUniversityCourses(scraperKey, { limit });
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
