function decodeHtmlEntities(value) {
  if (!value) {
    return '';
  }

  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(value) {
  return decodeHtmlEntities(String(value || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function htmlToTextLines(value) {
  const withBreaks = decodeHtmlEntities(String(value || ''))
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/ul|\/ol|\/h[1-6]|\/section|\/article)\b[^>]*>/gi, '\n')
    .replace(/<(p|div|li|ul|ol|h[1-6]|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return withBreaks
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function textFromHtml(value) {
  return normalizeWhitespace(stripTags(value));
}

function matchFirst(value, regex) {
  const match = String(value || '').match(regex);
  return match ? normalizeWhitespace(match[1]) : null;
}

function extractLinks(html, predicate) {
  const links = [];
  const regex = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = normalizeWhitespace(match[1]);
    const text = textFromHtml(match[2]);
    if (!href) {
      continue;
    }

    const link = { href, text };
    if (!predicate || predicate(link)) {
      links.push(link);
    }
  }

  return links;
}

function splitListItems(sectionHtml) {
  if (!sectionHtml) {
    return [];
  }

  const items = [];
  const regex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = regex.exec(sectionHtml)) !== null) {
    const text = textFromHtml(match[1]);
    if (text) {
      items.push(text);
    }
  }

  return items;
}

module.exports = {
  extractLinks,
  htmlToTextLines,
  matchFirst,
  normalizeWhitespace,
  splitListItems,
  textFromHtml,
};
