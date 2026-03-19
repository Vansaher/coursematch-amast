const QWEN_ENDPOINT =
  process.env.QWEN_ENDPOINT ||
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-plus';
const QWEN_TIMEOUT_MS = Number(process.env.QWEN_TIMEOUT_MS || 12000);

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

function summarize(value = '', fallback = 'Not provided') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return fallback;
  }
  return text.length > 260 ? `${text.slice(0, 259).trim()}...` : text;
}

function buildFallbackAnswer(course, question = '') {
  const lowerQuestion = String(question || '').toLowerCase();
  if (lowerQuestion.includes('intake') || lowerQuestion.includes('when')) {
    return course.intakeText
      ? `The course intake information currently listed is: ${summarize(course.intakeText)}`
      : 'No specific intake timing is currently stored for this course.';
  }

  if (lowerQuestion.includes('fee') || lowerQuestion.includes('tuition') || lowerQuestion.includes('cost')) {
    return course.tuitionText
      ? `The catalogue currently lists the tuition or fee note as: ${summarize(course.tuitionText)}`
      : 'No tuition details are currently stored for this course.';
  }

  if (lowerQuestion.includes('career') || lowerQuestion.includes('job')) {
    return course.careerProspects
      ? `The course page suggests these career directions: ${summarize(course.careerProspects)}`
      : 'No specific career prospects are currently stored, but the description suggests related study and career pathways.';
  }

  if (lowerQuestion.includes('parent') || lowerQuestion.includes('simple') || lowerQuestion.includes('summary')) {
    return `In simple terms, ${course.name} is a ${course.awardLevel || 'degree'} programme in ${course.faculty || 'its field'} at ${course.university?.name || 'the selected university'}. Students usually study ${summarize(course.description, 'the main discipline areas listed in the catalogue')}.`;
  }

  return `Based on the catalogue entry, ${course.name} at ${course.university?.name || 'the selected university'} focuses on ${summarize(course.description, 'the field described in the catalogue')}. Entry information: ${summarize(course.entryRequirements)}. Intake: ${summarize(course.intakeText)}.`;
}

async function askCourseQuestion(course, question = '') {
  if (!isQwenConfigured()) {
    return {
      answer: buildFallbackAnswer(course, question),
      source: 'fallback',
      model: null,
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
        temperature: 0.2,
        max_tokens: 350,
        messages: [
          {
            role: 'system',
            content:
              'You answer questions about a Malaysian university course using only the supplied catalogue data. Be concise, practical, and do not invent facts.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              question,
              course: {
                name: course.name,
                university: course.university?.name || null,
                faculty: course.faculty,
                awardLevel: course.awardLevel,
                studyMode: course.studyMode,
                durationText: course.durationText,
                intakeText: course.intakeText,
                tuitionText: course.tuitionText,
                description: course.description,
                entryRequirements: course.entryRequirements,
                careerProspects: course.careerProspects,
                modules: Array.isArray(course.modules) ? course.modules.map((module) => module.name).slice(0, 20) : [],
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

    return {
      answer: extractMessageContent(payload).trim() || buildFallbackAnswer(course, question),
      source: 'qwen',
      model: QWEN_MODEL,
    };
  } catch (error) {
    return {
      answer: `${buildFallbackAnswer(course, question)}\n\nFallback used because AI chat was unavailable: ${error.message}`,
      source: 'fallback',
      model: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  askCourseQuestion,
  isQwenConfigured,
};
