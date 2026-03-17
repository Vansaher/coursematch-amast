const { PDFParse } = require('pdf-parse');

const SUBJECT_ALIAS_MAP = {
  'PENGAJIAN AM': 'General Studies',
  'BAHASA MELAYU': 'Malay Language',
  GEOGRAFI: 'Geography',
  EKONOMI: 'Economics',
  'PENGAJIAN PERNIAGAAN': 'Business Studies',
  PERAKAUNAN: 'Accounting',
  SEJARAH: 'History',
  SYARIAH: 'Islamic Law',
  USULUDDIN: 'Islamic Studies',
  FIZIK: 'Physics',
  KIMIA: 'Chemistry',
  BIOLOGI: 'Biology',
  'MATEMATIK M': 'Mathematics M',
  'MATEMATIK T': 'Mathematics T',
  'SAINS SUKAN': 'Sports Science',
  'SENI VISUAL': 'Visual Arts',
  'KESUSASTERAAN INGGERIS': 'Literature in English',
  'KESUSASTERAAN MELAYU KOMUNIKATIF': 'Communicative Malay Literature',
  'BAHASA CINA': 'Chinese Language',
  'BAHASA TAMIL': 'Tamil Language',
  'BAHASA ARAB': 'Arabic Language',
  'TEKNOLOGI KOMUNIKASI DAN INFORMASI': 'Information and Communications Technology',
};

function normalizeWhitespace(value = '') {
  return String(value || '')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function toTitleCase(value = '') {
  return String(value || '')
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeSubjectName(value = '') {
  const cleaned = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  return SUBJECT_ALIAS_MAP[cleaned] || toTitleCase(cleaned);
}

function extractHeaderField(text, label) {
  const regex = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function gradePointToScore(gradePoint) {
  if (!Number.isFinite(gradePoint)) {
    return null;
  }

  return Math.round((Math.max(0, Math.min(4, gradePoint)) / 4) * 100 * 100) / 100;
}

function parseSubjectBlocks(text) {
  const lines = text.split('\n');
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    const headerMatch = line.match(/^(\d{3})\s+([A-Z][A-Z\s&/()-]+)$/);
    if (!headerMatch) {
      index += 1;
      continue;
    }

    const code = headerMatch[1];
    const rawSubject = headerMatch[2].trim();
    const consumed = [line];
    index += 1;

    while (index < lines.length) {
      const current = lines[index].trim();
      if (
        /^\d{3}\s+/.test(current) ||
        /^Nota[: ]/i.test(current) ||
        /^Badrul/i.test(current) ||
        /^-- \d+ of \d+ --$/.test(current)
      ) {
        break;
      }
      consumed.push(current);
      index += 1;
    }

    const joined = consumed.join(' ');
    const summaryMatch = joined.match(/\b([A-F][+-]?)\s+(\d\.\d{2})\b(?!.*\b[A-F][+-]?\s+\d\.\d{2}\b)/);
    if (!summaryMatch) {
      continue;
    }

    const grade = summaryMatch[1];
    const gradePoint = Number(summaryMatch[2]);
    blocks.push({
      code,
      rawSubject,
      subject: normalizeSubjectName(rawSubject),
      grade,
      gradePoint,
      score: gradePointToScore(gradePoint),
    });
  }

  return blocks;
}

async function parseStpmPdfBuffer(buffer) {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const text = normalizeWhitespace(result.text || '');

    if (!/SIJIL TINGGI PERSEKOLAHAN MALAYSIA|Slip Keputusan Peperiksaan STPM/i.test(text)) {
      throw new Error('Uploaded PDF does not look like an STPM result slip');
    }

    const subjects = parseSubjectBlocks(text);
    if (!subjects.length) {
      throw new Error('Unable to extract any STPM subjects from the PDF');
    }

    const scores = {};
    for (const subject of subjects) {
      if (subject.score !== null) {
        scores[subject.subject] = subject.score;
      }
    }

    return {
      student: {
        name: extractHeaderField(text, 'Nama'),
        identityNumber: extractHeaderField(text, 'No\\. Kad Pengenalan'),
        candidateNumber: extractHeaderField(text, 'Angka Giliran'),
        certificateNumber: extractHeaderField(text, 'No\\. Siri'),
        subjectCount: Number(extractHeaderField(text, 'Bil\\. Mata Pelajaran Didaftarkan') || subjects.length),
        pngk: Number(extractHeaderField(text, 'Purata Nilai Gred Keseluruhan \\(PNGK\\)') || 0),
      },
      scores,
      subjects,
    };
  } finally {
    await parser.destroy();
  }
}

module.exports = {
  parseStpmPdfBuffer,
};
