const QWEN_ENDPOINT =
  process.env.QWEN_ENDPOINT ||
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-plus';
const QWEN_TIMEOUT_MS = Number(process.env.QWEN_TIMEOUT_MS || 12000);

function normalizeText(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function extractMessageContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content.map((item) => item?.text || '').join('');
  }
  return String(content || '');
}

function parseJsonResponse(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('Qwen returned an empty response');
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)```/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

function normalizeSubjects(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => normalizeText(value)).filter(Boolean);
}

function normalizePathwayOutput(label, payload, rawText) {
  const minimumSummary = normalizeText(payload?.minimumSummary);
  const entryRequirementsText = normalizeText(payload?.entryRequirementsText) || normalizeText(rawText);
  const subjects = normalizeSubjects(payload?.structuredRequirements?.subjects);
  const languageExam = normalizeText(payload?.structuredRequirements?.languageExam);
  const notes = normalizeSubjects(payload?.structuredRequirements?.notes);

  if (!minimumSummary && !entryRequirementsText) {
    return null;
  }

  return {
    label,
    rawText: normalizeText(rawText),
    minimumSummary: minimumSummary || entryRequirementsText,
    entryRequirementsText,
    structuredRequirements: {
      subjects,
      languageExam: languageExam || null,
      notes,
    },
  };
}

function buildFallbackPathway(label, rawText) {
  const normalized = normalizeText(rawText);
  if (!normalized) {
    return null;
  }

  return {
    label,
    rawText: normalized,
    minimumSummary: normalized,
    entryRequirementsText: normalized,
    structuredRequirements: {
      subjects: [],
      languageExam: null,
      notes: [],
    },
  };
}

function buildCombinedEntryRequirements(generalRequirements = {}) {
  const pathways = ['stpm', 'matriculation', 'diplomaEquivalent']
    .map((key) => generalRequirements[key])
    .filter(Boolean);

  return pathways
    .map((pathway) => `${pathway.label} (Minimum): ${pathway.minimumSummary}`)
    .join('\n');
}

async function normalizeGeneralEntryRequirements(inputs = {}) {
  const stpm = normalizeText(inputs.stpm);
  const matriculation = normalizeText(inputs.matriculation);
  const diplomaEquivalent = normalizeText(inputs.diplomaEquivalent);

  if (!stpm && !matriculation && !diplomaEquivalent) {
    return null;
  }

  if (!process.env.QWEN_API_KEY) {
    return {
      stpm: buildFallbackPathway('STPM', stpm),
      matriculation: buildFallbackPathway('Matriculation', matriculation),
      diplomaEquivalent: buildFallbackPathway('Diploma/Equivalent', diplomaEquivalent),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QWEN_TIMEOUT_MS);

  try {
    const response = await fetch(QWEN_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.QWEN_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: QWEN_MODEL,
        temperature: 0.1,
        max_tokens: 700,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You normalize Malaysian university pathway entry requirements into structured JSON. Return JSON only. Preserve requirement meaning. Summaries must be concise minimum-requirement statements, not prose paragraphs.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task:
                'Convert the natural-language entry requirements into concise minimum summaries and structured fields for STPM, Matriculation, and Diploma/Equivalent. Keep grade thresholds in the summary text. Extract only clearly stated subjects into structuredRequirements.subjects. Extract MUET or other language tests into structuredRequirements.languageExam.',
              outputContract: {
                stpm: {
                  minimumSummary: 'short string such as Bahasa Melayu (Credit), History (Pass), General Studies (C/2.00), MUET (Band 2)',
                  entryRequirementsText: 'single compact text block',
                  structuredRequirements: {
                    subjects: ['subject names only'],
                    languageExam: 'string or null',
                    notes: ['short notes'],
                  },
                },
                matriculation: {
                  minimumSummary: 'short string',
                  entryRequirementsText: 'single compact text block',
                  structuredRequirements: {
                    subjects: ['subject names only'],
                    languageExam: 'string or null',
                    notes: ['short notes'],
                  },
                },
                diplomaEquivalent: {
                  minimumSummary: 'short string',
                  entryRequirementsText: 'single compact text block',
                  structuredRequirements: {
                    subjects: ['subject names only'],
                    languageExam: 'string or null',
                    notes: ['short notes'],
                  },
                },
              },
              inputs: {
                stpm,
                matriculation,
                diplomaEquivalent,
              },
            }),
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || `Qwen request failed with ${response.status}`);
    }

    const parsed = parseJsonResponse(extractMessageContent(payload));
    return {
      stpm: normalizePathwayOutput('STPM', parsed?.stpm, stpm),
      matriculation: normalizePathwayOutput('Matriculation', parsed?.matriculation, matriculation),
      diplomaEquivalent: normalizePathwayOutput('Diploma/Equivalent', parsed?.diplomaEquivalent, diplomaEquivalent),
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  normalizeGeneralEntryRequirements,
  buildCombinedEntryRequirements,
};
