function deriveUniversityAbbreviation(university) {
  const metadataAbbreviation =
    university && university.metadata && university.metadata.abbreviation
      ? String(university.metadata.abbreviation).toUpperCase()
      : null;

  if (metadataAbbreviation) {
    return metadataAbbreviation;
  }

  const stopwords = new Set(['OF', 'THE', 'AND']);
  const name = String((university && university.name) || '').trim();

  const tokens = name
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z]/gi, ''))
    .filter((token) => token && !stopwords.has(token.toUpperCase()));

  if (!tokens.length) {
    return '';
  }

  return tokens.map((token) => token[0].toUpperCase()).join('');
}

module.exports = {
  deriveUniversityAbbreviation,
};
