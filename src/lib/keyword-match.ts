function normalizeKeywordText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeKeywordText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
}

function toTokenCounts(tokens: string[]) {
  const counts = new Map<string, number>();
  tokens.forEach((token) => {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  });
  return counts;
}

function hasRequiredCounts(current: Map<string, number>, required: Map<string, number>) {
  for (const [token, needed] of required.entries()) {
    if ((current.get(token) ?? 0) < needed) {
      return false;
    }
  }
  return true;
}

export function parseKeywordCandidates(rawKeywordInput: string) {
  const unique = new Set<string>();
  rawKeywordInput
    .split(",")
    .map((part) => normalizeKeywordText(part))
    .filter(Boolean)
    .forEach((keyword) => unique.add(keyword));
  return [...unique];
}

export function formatKeywordCandidates(candidates: string[]) {
  return candidates.join(", ");
}

export function formatKeywordCandidatesAsQuotedList(candidates: string[]) {
  const cleaned = candidates
    .map((candidate) => normalizeKeywordText(candidate))
    .filter(Boolean);

  if (cleaned.length === 0) return "";
  return cleaned.map((candidate) => `"${candidate}"`).join(", ");
}

export function formatKeywordCandidatesForDisplay(candidates: string[]) {
  const cleaned = candidates
    .map((candidate) => normalizeKeywordText(candidate))
    .filter(Boolean);

  if (cleaned.length === 0) return "";
  return cleaned.map((candidate) => `"${candidate}"`).join(" OR ");
}

export function isKeywordEquivalentMatch(content: string, keyword: string) {
  const normalizedContent = normalizeKeywordText(content);
  const normalizedKeyword = normalizeKeywordText(keyword);

  if (!normalizedContent || !normalizedKeyword) {
    return false;
  }

  if (normalizedContent.includes(normalizedKeyword)) {
    return true;
  }

  const keywordTokens = tokenize(keyword);
  const contentTokens = tokenize(content);
  if (keywordTokens.length === 0 || contentTokens.length === 0) {
    return false;
  }

  if (keywordTokens.length === 1) {
    return contentTokens.includes(keywordTokens[0]);
  }

  const requiredCounts = toTokenCounts(keywordTokens);
  const windowSize = Math.min(contentTokens.length, keywordTokens.length + 2);

  for (let start = 0; start < contentTokens.length; start += 1) {
    const windowCounts = new Map<string, number>();
    for (let end = start; end < contentTokens.length && end < start + windowSize; end += 1) {
      const token = contentTokens[end];
      if (!requiredCounts.has(token)) {
        continue;
      }
      windowCounts.set(token, (windowCounts.get(token) ?? 0) + 1);
      if (hasRequiredCounts(windowCounts, requiredCounts)) {
        return true;
      }
    }
  }

  return false;
}

export function matchesAnyKeywordEquivalent(content: string, keywords: string[]) {
  return keywords.some((keyword) => isKeywordEquivalentMatch(content, keyword));
}

/** Every target phrase must appear as a contiguous substring after normalization (case- and punctuation-insensitive). */
export function textContainsAllExactKeywords(text: string, keywords: string[]) {
  if (!keywords.length) return false;
  const normalizedText = normalizeKeywordText(text);
  return keywords.every((kw) => {
    const n = normalizeKeywordText(kw);
    return Boolean(n && normalizedText.includes(n));
  });
}

/** Adds consecutive 2-word phrases from 3+ token targets so "customer service software" matches "customer service" in headings. */
export function expandKeywordsForSemanticMatch(rawKeywords: string[]): string[] {
  const out = new Set<string>();
  for (const k of rawKeywords) {
    const norm = normalizeKeywordText(k);
    if (!norm) continue;
    out.add(norm);
    const tokens = tokenize(k);
    if (tokens.length >= 3) {
      for (let i = 0; i <= tokens.length - 2; i += 1) {
        out.add(`${tokens[i]} ${tokens[i + 1]}`);
      }
    }
  }
  return [...out];
}

export function countExactKeywordMatches(content: string, keywords: string[]) {
  const normalizedContent = normalizeKeywordText(content);
  if (!normalizedContent || keywords.length === 0) return 0;

  return keywords.reduce((count, keyword) => {
    const normalizedKeyword = normalizeKeywordText(keyword);
    if (!normalizedKeyword) return count;
    return count + (normalizedContent.split(normalizedKeyword).length - 1);
  }, 0);
}
