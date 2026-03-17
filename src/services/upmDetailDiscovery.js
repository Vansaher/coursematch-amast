const { buildUpmCourseDetail } = require('./upmCourseDetails');

function buildSeedDetail(course) {
  const seeded = buildUpmCourseDetail(course.name);
  if (!seeded) {
    return null;
  }

  return {
    ...seeded,
    metadata: {
      ...(seeded.metadata || {}),
      detailConfidence: 1,
      detailMatchReason: 'seeded-detail-map',
    },
  };
}

async function discoverUpmCourseDetails(courses = []) {
  const detailByCourseName = new Map();

  for (const course of courses) {
    const seeded = buildSeedDetail(course);
    if (seeded) {
      detailByCourseName.set(course.name, seeded);
    }
  }

  return detailByCourseName;
}

module.exports = {
  discoverUpmCourseDetails,
};
