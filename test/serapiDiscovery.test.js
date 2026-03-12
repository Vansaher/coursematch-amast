const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildQueries,
  getAllowedDomains,
  scoreResult,
} = require('../src/services/serapiDiscovery');

const university = {
  name: 'Universiti Putra Malaysia',
  websiteUrl: 'https://www.upm.edu.my',
  metadata: {
    allowedDomains: ['akademik.upm.edu.my'],
  },
};

const course = {
  name: 'Bacelor Sains Komputer dengan Kepujian',
  faculty: 'Fakulti Sains Komputer dan Teknologi Maklumat',
};

test('buildQueries includes course and university context', () => {
  const queries = buildQueries(course, university);
  assert.ok(queries.some((query) => query.includes(course.name)));
  assert.ok(queries.some((query) => query.includes(university.name)));
  assert.ok(queries.some((query) => query.includes(course.faculty)));
});

test('getAllowedDomains derives official domains', () => {
  const domains = getAllowedDomains(university);
  assert.ok(domains.includes('www.upm.edu.my'));
  assert.ok(domains.includes('upm.edu.my'));
  assert.ok(domains.includes('akademik.upm.edu.my'));
});

test('scoreResult prefers exact official programme results', () => {
  const allowedDomains = getAllowedDomains(university);
  const official = scoreResult(
    {
      title: 'Bacelor Sains Komputer dengan Kepujian - Universiti Putra Malaysia',
      snippet: 'Programme structure and admission requirements',
      link: 'https://akademik.upm.edu.my/programme/bacelor-sains-komputer',
    },
    course,
    university,
    allowedDomains
  );

  const generic = scoreResult(
    {
      title: 'UPM News',
      snippet: 'Latest event from campus',
      link: 'https://www.upm.edu.my/news',
    },
    course,
    university,
    allowedDomains
  );

  assert.ok(official);
  assert.ok(generic);
  assert.ok(official.score > generic.score);
});

test('scoreResult excludes non-official domains', () => {
  const allowedDomains = getAllowedDomains(university);
  const result = scoreResult(
    {
      title: 'Study in Malaysia',
      snippet: 'Third-party listing',
      link: 'https://example.com/upm-computer-science',
    },
    course,
    university,
    allowedDomains
  );

  assert.equal(result, null);
});
