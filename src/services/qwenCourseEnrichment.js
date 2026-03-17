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

function normalizeList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((value) => normalizeText(value)).filter(Boolean);
}

function isQwenConfigured() {
  return Boolean(process.env.QWEN_API_KEY);
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

async function enrichCourseDetails(coursePayload, universityPayload, context = {}) {
  if (!isQwenConfigured()) {
    return null;
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
        temperature: 0.3,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You generate structured academic course catalogue entries. Return JSON only. Use extracted facts when available. If details are missing, infer a realistic general overview from the course title and faculty. Do not fabricate rankings, tuition, accreditation, or exact admission thresholds unless explicitly given. Preserve the original course name and faculty name exactly as provided. Descriptive fields may be written in English.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              task:
                'Generate the main course detail payload for a university course catalogue. Keep the course name and faculty name exactly as provided, usually in Malay. Describe the field, likely study mode, duration, what students study, skills gained, career outcomes, and entry requirements. The description and overview fields may be in English.',
              outputContract: {
                name: 'repeat the original course title exactly',
                faculty: 'repeat the original faculty name exactly',
                field: 'short field classification',
                studyMode: 'short study mode string',
                durationText: 'short duration string',
                description: '2-4 sentences describing the programme in detail',
                whatYouStudy: ['bullet strings'],
                skillsGained: ['bullet strings'],
                careerOutcomes: ['bullet strings'],
                entryRequirements: 'short paragraph',
                structuredRequirements: {
                  languageExam: 'string or null',
                  subjects: ['subject names'],
                },
                sourceMode: 'grounded or inferred',
              },
              course: {
                name: coursePayload.name,
                faculty: coursePayload.faculty,
                awardLevel: coursePayload.awardLevel,
                studyMode: coursePayload.studyMode,
                durationText: coursePayload.durationText,
                description: coursePayload.description,
                entryRequirements: coursePayload.entryRequirements,
                careerProspects: coursePayload.careerProspects,
                university: universityPayload?.name || null,
              },
              extractedContext: {
                description: context.extractedDescription || null,
                durationText: context.extractedDurationText || null,
                entryRequirements: context.extractedEntryRequirements || null,
                detailUrl: context.detailUrl || null,
                detailSourceType: context.detailSourceType || null,
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
    const careerOutcomes = normalizeList(parsed?.careerOutcomes);

    return {
      name: coursePayload.name,
      faculty: coursePayload.faculty,
      field: normalizeText(parsed?.field) || null,
      studyMode: normalizeText(parsed?.studyMode) || coursePayload.studyMode || null,
      durationText: normalizeText(parsed?.durationText) || coursePayload.durationText || null,
      description: normalizeText(parsed?.description) || coursePayload.description,
      whatYouStudy: normalizeList(parsed?.whatYouStudy),
      skillsGained: normalizeList(parsed?.skillsGained),
      careerOutcomes,
      careerProspects: careerOutcomes.join('\n') || coursePayload.careerProspects || null,
      entryRequirements: normalizeText(parsed?.entryRequirements) || coursePayload.entryRequirements || null,
      requirements:
        parsed?.structuredRequirements && typeof parsed.structuredRequirements === 'object'
          ? {
              languageExam: normalizeText(parsed.structuredRequirements.languageExam || ''),
              subjects: normalizeList(parsed.structuredRequirements.subjects),
            }
          : null,
      sourceMode: normalizeText(parsed?.sourceMode) || 'inferred',
      model: QWEN_MODEL,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  enrichCourseDetails,
  isQwenConfigured,
};
