const jobs = new Map();

function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getTimestamp() {
  return new Date().toISOString();
}

function createJob(type, meta = {}) {
  const id = generateJobId();
  const job = {
    id,
    type,
    status: 'queued',
    progress: 0,
    stage: 'queued',
    message: 'Queued',
    counters: {},
    meta,
    result: null,
    error: null,
    createdAt: getTimestamp(),
    updatedAt: getTimestamp(),
    startedAt: null,
    finishedAt: null,
  };
  jobs.set(id, job);
  return job;
}

function updateJob(id, patch = {}) {
  const job = jobs.get(id);
  if (!job) {
    return null;
  }

  const mergedCounters = patch.counters
    ? { ...(job.counters || {}), ...patch.counters }
    : job.counters;

  Object.assign(job, patch, {
    counters: mergedCounters,
    updatedAt: getTimestamp(),
  });

  return job;
}

function getJob(id) {
  return jobs.get(id) || null;
}

function listJobs(type = null) {
  return [...jobs.values()]
    .filter((job) => !type || job.type === type)
    .sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
}

function serializeJob(job) {
  if (!job) {
    return null;
  }

  return JSON.parse(JSON.stringify(job));
}

function startJob(id, task) {
  updateJob(id, {
    status: 'running',
    stage: 'starting',
    message: 'Starting',
    progress: 1,
    startedAt: getTimestamp(),
  });

  Promise.resolve()
    .then(task)
    .then((result) => {
      updateJob(id, {
        status: 'completed',
        stage: 'completed',
        message: 'Completed',
        progress: 100,
        result,
        finishedAt: getTimestamp(),
      });
    })
    .catch((error) => {
      updateJob(id, {
        status: 'failed',
        stage: 'failed',
        message: error.message || 'Job failed',
        progress: 100,
        error: {
          message: error.message || 'Job failed',
        },
        finishedAt: getTimestamp(),
      });
    });
}

module.exports = {
  createJob,
  getJob,
  listJobs,
  serializeJob,
  startJob,
  updateJob,
};
