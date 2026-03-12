const DETAIL_SOURCE_MAP = {
  'bacelor-sains-komputer-dengan-kepujian': {
    detailUrl:
      'https://akademik.upm.edu.my/upload/dokumen/20251001094438Fakulti_Sains_Komputer_dan_Teknologi_Maklumat_Sesi_2025-2026_2.9.2025.pdf',
    detailSourceType: 'pdf-curriculum',
    durationText: '8 semesters / 4 years',
    metadata: {
      facultyDocument: 'FSKTM curriculum structure 2025/2026',
    },
  },
  'bacelor-sains-komputer-pengkomputeran-multimedia-dengan-kepujian': {
    detailUrl:
      'https://akademik.upm.edu.my/upload/dokumen/20251001094438Fakulti_Sains_Komputer_dan_Teknologi_Maklumat_Sesi_2025-2026_2.9.2025.pdf',
    detailSourceType: 'pdf-curriculum',
    durationText: '8 semesters / 4 years',
    metadata: {
      facultyDocument: 'FSKTM curriculum structure 2025/2026',
    },
  },
  'bacelor-kejuruteraan-perisian-dengan-kepujian': {
    detailUrl:
      'https://akademik.upm.edu.my/upload/dokumen/20251001094438Fakulti_Sains_Komputer_dan_Teknologi_Maklumat_Sesi_2025-2026_2.9.2025.pdf',
    detailSourceType: 'pdf-curriculum',
    durationText: '8 semesters / 4 years',
    metadata: {
      facultyDocument: 'FSKTM curriculum structure 2025/2026',
    },
  },
  'bacelor-sains-komputer-rangkaian-komputer-dengan-kepujian': {
    detailUrl:
      'https://akademik.upm.edu.my/upload/dokumen/20251001094438Fakulti_Sains_Komputer_dan_Teknologi_Maklumat_Sesi_2025-2026_2.9.2025.pdf',
    detailSourceType: 'pdf-curriculum',
    durationText: '8 semesters / 4 years',
    metadata: {
      facultyDocument: 'FSKTM curriculum structure 2025/2026',
    },
  },
};

function normalizeMalaysianProgrammeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, (value) => value.replace(/\s+/g, ' '))
    .replace(/dengan kepujian/g, 'dengan-kepujian')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildUpmCourseDetail(courseName) {
  const key = normalizeMalaysianProgrammeName(courseName);
  return DETAIL_SOURCE_MAP[key] || null;
}

module.exports = {
  buildUpmCourseDetail,
};
