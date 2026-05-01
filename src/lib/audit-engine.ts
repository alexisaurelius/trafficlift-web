import { AuditStatus } from "@prisma/client";
import { load, type Cheerio } from "cheerio";
import type { AnyNode } from "domhandler";
import { prisma } from "@/lib/prisma";
import { AUDIT_CHECKLIST } from "@/lib/seo-checklist";
import { CRO_AUDIT_CHECKLIST } from "@/lib/cro-checklist";
import { isCroAuditKeyword } from "@/lib/audit-mode";
import {
  countExactKeywordMatches,
  formatKeywordCandidatesAsQuotedList,
  parseKeywordCandidates,
  textContainsAllExactKeywords,
} from "@/lib/keyword-match";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

type CheckResult = {
  key: string;
  score: number;
  details: string;
  recommendation: string;
  status?: "pass" | "fail" | "warn";
  negativeSignals?: number;
};

type CroScoreDeduction = {
  key: string;
  title: string;
  priority: string;
  status: "pass" | "fail" | "warn";
  penalty: number;
};

type CroScoreBreakdown = {
  formula: string;
  totalPenalty: number;
  deductions: CroScoreDeduction[];
};

const PRIORITY_WEIGHT = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
} as const;

type RedirectProbe = {
  requestedUrl: string;
  finalUrl: string;
  finalStatus: number | null;
  hops: number;
  usedTemporaryRedirect: boolean;
  loopDetected: boolean;
  chain: string[];
  xRobotsTag: string;
  html: string | null;
  serverHeader: string;
  cfMitigated: string;
  challengeDetected: boolean;
};

type AssetHeaderProbe = {
  url: string;
  status: number | null;
  cacheControl: string;
  contentEncoding: string;
  contentType: string;
};

function redirectStatus(status: number) {
  return status >= 300 && status < 400;
}

async function fetchWithRedirectTrace(
  url: string,
  options?: { includeBody?: boolean; maxRedirects?: number },
): Promise<RedirectProbe> {
  const includeBody = options?.includeBody ?? false;
  const maxRedirects = options?.maxRedirects ?? 6;
  const hopTimeoutMs = Number(process.env.AUDIT_FETCH_TIMEOUT_MS ?? 45_000);
  const chain = [url];
  const visited = new Set<string>([url]);
  let current = url;
  let usedTemporaryRedirect = false;

  const fetchWithTimeout = async (fetchUrl: string, useBrowserHeaders = false) => {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), hopTimeoutMs);
    try {
      return await fetch(fetchUrl, {
        headers: useBrowserHeaders
          ? {
              "user-agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
          : { "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)" },
        cache: "no-store",
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(tid);
    }
  };

  const readBodyWithCap = async (response: Response) => {
    const text = await Promise.race([
      response.text(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Response body exceeded ${hopTimeoutMs}ms`)), hopTimeoutMs);
      }),
    ]);
    return text;
  };

  for (let i = 0; i <= maxRedirects; i += 1) {
    let response = await fetchWithTimeout(current);
    const location = response.headers.get("location");
    const isRedirect = redirectStatus(response.status) && Boolean(location);

    if (!isRedirect || !location) {
      if (response.status >= 400 && response.status < 600) {
        response = await fetchWithTimeout(current, true);
      }
      const html = includeBody ? await readBodyWithCap(response) : null;
      const serverHeader = response.headers.get("server") ?? "";
      const cfMitigated = response.headers.get("cf-mitigated") ?? "";
      return {
        requestedUrl: url,
        finalUrl: current,
        finalStatus: response.status,
        hops: chain.length - 1,
        usedTemporaryRedirect,
        loopDetected: false,
        chain,
        xRobotsTag: response.headers.get("x-robots-tag") ?? "",
        html,
        serverHeader,
        cfMitigated,
        challengeDetected: isLikelyBotChallenge(response.status, serverHeader, cfMitigated, html),
      };
    }

    usedTemporaryRedirect ||= [302, 303, 307].includes(response.status);
    const nextUrl = safeUrl(location, current)?.toString();
    if (!nextUrl) {
      return {
        requestedUrl: url,
        finalUrl: current,
        finalStatus: response.status,
        hops: chain.length - 1,
        usedTemporaryRedirect,
        loopDetected: false,
        chain,
        xRobotsTag: response.headers.get("x-robots-tag") ?? "",
        html: null,
        serverHeader: response.headers.get("server") ?? "",
        cfMitigated: response.headers.get("cf-mitigated") ?? "",
        challengeDetected: false,
      };
    }

    if (visited.has(nextUrl)) {
      chain.push(nextUrl);
      return {
        requestedUrl: url,
        finalUrl: nextUrl,
        finalStatus: response.status,
        hops: chain.length - 1,
        usedTemporaryRedirect,
        loopDetected: true,
        chain,
        xRobotsTag: response.headers.get("x-robots-tag") ?? "",
        html: null,
        serverHeader: response.headers.get("server") ?? "",
        cfMitigated: response.headers.get("cf-mitigated") ?? "",
        challengeDetected: false,
      };
    }

    visited.add(nextUrl);
    chain.push(nextUrl);
    current = nextUrl;
  }

  return {
    requestedUrl: url,
    finalUrl: current,
    finalStatus: null,
    hops: chain.length - 1,
    usedTemporaryRedirect,
    loopDetected: false,
    chain,
    xRobotsTag: "",
    html: null,
    serverHeader: "",
    cfMitigated: "",
    challengeDetected: false,
  };
}

async function fetchText(url: string) {
  const ms = Number(process.env.AUDIT_FETCH_TIMEOUT_MS ?? 45_000);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

const CACHE_STRONG_THRESHOLD_SEC = 86400;

function hasStrongCacheControl(cacheControlHeader: string) {
  const value = cacheControlHeader.toLowerCase();
  if (!value) return false;
  if (value.includes("immutable")) return true;
  const match = value.match(/max-age=(\d+)/i);
  if (!match) return false;
  return Number(match[1]) >= CACHE_STRONG_THRESHOLD_SEC;
}

function formatCacheControlEvidence(probes: AssetHeaderProbe[]) {
  return probes
    .map((p) => `${p.url}\n  Cache-Control: ${p.cacheControl.trim() || "(none)"}`)
    .join("\n");
}

function isLikelyCompressibleAsset(url: string, contentTypeHeader: string) {
  const contentType = contentTypeHeader.toLowerCase();
  if (
    /(javascript|ecmascript|css|json|xml|text\/|svg|html)/i.test(contentType) &&
    !/image\/(png|jpe?g|gif|webp|avif)/i.test(contentType)
  ) {
    return true;
  }
  return /\.(js|mjs|cjs|css|json|xml|svg)(\?|$)/i.test(url);
}

async function fetchAssetHeaders(url: string): Promise<AssetHeaderProbe> {
  const userAgentHeader = { "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)" };
  try {
    const headResponse = await fetch(url, {
      method: "HEAD",
      headers: userAgentHeader,
      cache: "no-store",
    });

    if (headResponse.ok || ![405, 501].includes(headResponse.status)) {
      return {
        url,
        status: headResponse.status,
        cacheControl: headResponse.headers.get("cache-control") ?? "",
        contentEncoding: headResponse.headers.get("content-encoding") ?? "",
        contentType: headResponse.headers.get("content-type") ?? "",
      };
    }

    const fallbackResponse = await fetch(url, {
      method: "GET",
      headers: { ...userAgentHeader, range: "bytes=0-0" },
      cache: "no-store",
    });
    return {
      url,
      status: fallbackResponse.status,
      cacheControl: fallbackResponse.headers.get("cache-control") ?? "",
      contentEncoding: fallbackResponse.headers.get("content-encoding") ?? "",
      contentType: fallbackResponse.headers.get("content-type") ?? "",
    };
  } catch {
    return {
      url,
      status: null,
      cacheControl: "",
      contentEncoding: "",
      contentType: "",
    };
  }
}

function safeUrl(value: string, base: string) {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function collectJsonLdTypes(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectJsonLdTypes(entry));
  }

  const node = value as Record<string, unknown>;
  const rawType = node["@type"];
  const ownTypes = Array.isArray(rawType)
    ? rawType.filter((t): t is string => typeof t === "string")
    : typeof rawType === "string"
      ? [rawType]
      : [];
  const nestedTypes = Object.entries(node)
    .filter(([key]) => key !== "@type")
    .flatMap(([, nestedValue]) => collectJsonLdTypes(nestedValue));
  return [...ownTypes, ...nestedTypes];
}

function collectTopLevelJsonLdTypes(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectTopLevelJsonLdTypes(entry));
  }

  const node = value as Record<string, unknown>;
  const readTypes = (candidate: unknown): string[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const record = candidate as Record<string, unknown>;
    const rawType = record["@type"];
    return Array.isArray(rawType)
      ? rawType.filter((t): t is string => typeof t === "string")
      : typeof rawType === "string"
        ? [rawType]
        : [];
  };

  const ownTypes = readTypes(node);
  const graphNodes = Array.isArray(node["@graph"]) ? (node["@graph"] as unknown[]) : [];
  const graphTypes = graphNodes.flatMap((entry) => readTypes(entry));
  return [...ownTypes, ...graphTypes];
}

function detectLocaleVariantsInUrls(urls: string[], fallbackOrigin: string) {
  const localePattern = /^([a-z]{2})(-[a-z]{2})?$/i;
  const hosts = new Set<string>();
  const pathLocaleSignals = new Set<string>();

  urls.forEach((raw) => {
    const resolved = safeUrl(raw, fallbackOrigin);
    if (!resolved) return;
    hosts.add(resolved.hostname.toLowerCase());
    const segments = resolved.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
    const firstSegment = segments[0] ?? "";
    if (localePattern.test(firstSegment)) {
      pathLocaleSignals.add(firstSegment.toLowerCase());
    }
  });

  const localeSubdomains = [...hosts]
    .map((host) => host.split(".")[0] ?? "")
    .filter((subdomain) => localePattern.test(subdomain))
    .map((subdomain) => subdomain.toLowerCase());

  const distinctLocales = new Set([...pathLocaleSignals, ...localeSubdomains]);
  return distinctLocales.size >= 2;
}

function isLikelyBotChallenge(
  status: number | null,
  serverHeader: string,
  cfMitigated: string,
  html: string | null,
) {
  if (!status || ![403, 429, 503].includes(status)) return false;
  const server = serverHeader.toLowerCase();
  const body = (html ?? "").toLowerCase();
  const hasCloudflareSignal = server.includes("cloudflare") || cfMitigated.trim().length > 0;
  const hasAkamaiSignal = server.includes("akamai") || body.includes("akamai bot manager");
  const hasPerimeterXSignal = body.includes("perimeterx") || body.includes("px-captcha");
  const hasChallengeSignature =
    body.includes("just a moment") ||
    body.includes("cf-challenge") ||
    body.includes("attention required") ||
    body.includes("verify you are human") ||
    body.includes("checking your browser");
  return (hasCloudflareSignal && hasChallengeSignature) || hasAkamaiSignal || hasPerimeterXSignal;
}

function parseSitemapLocs(sitemapText: string | null) {
  if (!sitemapText) return [];
  const matches = sitemapText.matchAll(/<loc>(.*?)<\/loc>/gi);
  return [...matches]
    .map((m) => m[1]?.trim())
    .filter((entry): entry is string => Boolean(entry));
}

function parseRobotsSitemapUrls(robotsText: string | null, baseUrl: string) {
  if (!robotsText) return [];
  const matches = robotsText.matchAll(/^\s*sitemap:\s*(.+)\s*$/gim);
  const urls = [...matches]
    .map((m) => m[1]?.trim())
    .filter((entry): entry is string => Boolean(entry))
    .map((entry) => safeUrl(entry, baseUrl)?.toString())
    .filter((entry): entry is string => Boolean(entry));

  return [...new Set(urls)];
}

const MAX_SITEMAP_DOC_FETCHES = 150;

/**
 * Walk sitemap indexes recursively (child .xml files) and collect page <loc> URLs from urlsets.
 * Stops after MAX_SITEMAP_DOC_FETCHES documents to bound audit time.
 */
async function collectSitemapPageUrls(seedUrls: string[], origin: string) {
  const queued = [
    ...new Set(seedUrls.map((u) => safeUrl(u, origin)?.toString()).filter((u): u is string => Boolean(u))),
  ];
  const seenSitemap = new Set<string>();
  const pageUrls = new Set<string>();
  let docsFetched = 0;
  let stoppedEarly = false;

  while (queued.length > 0 && docsFetched < MAX_SITEMAP_DOC_FETCHES) {
    const url = queued.shift()!;
    const key = url.split("#")[0];
    if (seenSitemap.has(key)) continue;
    seenSitemap.add(key);
    const text = await fetchText(url);
    docsFetched += 1;
    if (!text) continue;

    const locs = parseSitemapLocs(text);
    const isIndex = /<sitemapindex[\s>]/i.test(text);

    if (isIndex) {
      for (const loc of locs) {
        const next = safeUrl(loc, origin)?.toString();
        if (next && !seenSitemap.has(next.split("#")[0])) queued.push(next);
      }
      continue;
    }

    const xmlLikeShare =
      locs.length > 0 ? locs.filter((l) => /\.xml($|\?)/i.test(l)).length / locs.length : 0;
    if (!/<urlset[\s>]/i.test(text) && xmlLikeShare > 0.35 && locs.length >= 2) {
      for (const loc of locs) {
        const next = safeUrl(loc, origin)?.toString();
        if (next && /\.xml($|\?)/i.test(next) && !seenSitemap.has(next.split("#")[0])) queued.push(next);
      }
      continue;
    }

    for (const loc of locs) {
      if (!loc || /\.xml($|\?)/i.test(loc)) continue;
      pageUrls.add(loc);
    }
  }

  if (queued.length > 0 && docsFetched >= MAX_SITEMAP_DOC_FETCHES) stoppedEarly = true;

  return { pageUrls: [...pageUrls], docsFetched, stoppedEarly };
}

function normalizePageUrlForComparison(url: URL) {
  return normalizeUrl(`${url.origin}${url.pathname}`);
}

function formatList(values: string[], fallback = "none", limit = 5) {
  if (values.length === 0) return fallback;
  const shown = values.slice(0, limit);
  const remainder = values.length - shown.length;
  return remainder > 0 ? `${shown.join(", ")} (+${remainder} more)` : shown.join(", ");
}

function truncateWithEllipsis(value: string, maxChars = 40) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(maxChars - 1, 1)).trimEnd()}…`;
}

function toTitleCaseDisplay(value: string) {
  return value
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      if (/^[A-Z0-9]{2,}$/.test(word)) return word;
      return `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`;
    })
    .join(" ");
}

function collectMatches(text: string, pattern: RegExp, limit = 6) {
  if (!text) return [];
  const source = pattern.source;
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(source, flags);
  const matches = new Set<string>();
  let current = regex.exec(text);

  while (current) {
    const value = (current[0] ?? "").replace(/\s+/g, " ").trim();
    if (value) matches.add(value);
    if (matches.size >= limit) break;
    current = regex.exec(text);
  }

  return [...matches];
}

function collectSentenceMatches(text: string, pattern: RegExp, limit = 6) {
  if (!text) return [];
  const source = pattern.source;
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const regex = new RegExp(source, flags);
  const snippets = new Set<string>();
  let current = regex.exec(text);

  while (current) {
    const matchStart = current.index;
    const matchEnd = matchStart + (current[0]?.length ?? 0);
    const before = text.lastIndexOf(".", Math.max(matchStart - 1, 0));
    const afterCandidates = [text.indexOf(".", matchEnd), text.indexOf(";", matchEnd), text.indexOf("\n", matchEnd)].filter(
      (value) => value >= 0,
    );
    const after = afterCandidates.length > 0 ? Math.min(...afterCandidates) : -1;
    const start = before >= 0 ? before + 1 : Math.max(matchStart - 40, 0);
    const end = after >= 0 ? after : Math.min(text.length, matchEnd + 120);
    const snippet = text
      .slice(start, end)
      .replace(/\s+/g, " ")
      .trim();
    if (snippet) snippets.add(truncateWithEllipsis(snippet, 160));
    if (snippets.size >= limit) break;
    current = regex.exec(text);
  }

  return [...snippets];
}

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

const RISK_REVERSAL_REGEX =
  /no credit card required|no credit card|cancel anytime|cancel any time|cancel whenever|free trial|try for free|try free|\b\d+[- ]?day(?:\s+free)?\s+trial\b|free for \d+ days|money[- ]back(?: guarantee)?|no commitment|no contract|no obligation|month[- ]to[- ]month|try free for|two[- ]weeks?/gi;

function collectRiskReversalMatches(text: string, limit = 8) {
  return collectMatches(text, RISK_REVERSAL_REGEX, limit);
}

function looksLikeFaqQuestionText(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8 || t.length > 280) return false;
  if (/^(menu|close|open|next|previous|back|show more|see more|expand|collapse)\b/i.test(t)) return false;
  return /\?\s*$/.test(t) || /^(what|how|why|when|where|which|who|can|do|does|did|is|are|will|should|could|would)\b/i.test(t);
}

function tokenWindowAroundMatch(fullText: string, matchStart: number, matchEnd: number, beforeTokens: number, afterTokens: number) {
  const beforeSlice = fullText.slice(0, matchStart);
  const afterSlice = fullText.slice(matchEnd);
  const before = beforeSlice.split(/\s+/).filter(Boolean).slice(-beforeTokens);
  const after = afterSlice.split(/\s+/).filter(Boolean).slice(0, afterTokens);
  const matched = fullText.slice(matchStart, matchEnd).replace(/\s+/g, " ").trim();
  return [...before, matched, ...after].join(" ").replace(/\s+/g, " ").trim();
}

function collectNumericMetricSnippets(text: string, limit = 5) {
  if (!text) return [];
  const pattern = /\b\+?\d+(?:\.\d+)?\s?%/gi;
  const out: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index ?? 0;
    const end = start + (match[0]?.length ?? 0);
    const snippet = truncateWithEllipsis(tokenWindowAroundMatch(text, start, end, 6, 6), 120);
    const dedupeKey = `${(match[0] ?? "").toLowerCase()}|${snippet.slice(0, 48).toLowerCase()}`;
    if (!snippet || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(snippet);
    if (out.length >= limit) break;
  }
  return out;
}

/** Short clauses around each % so one nav sentence does not count as three duplicate "cues". */
function extractPercentStatClauses(text: string, limit = 6) {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\d+(?:\.\d+)?\s*%/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null && out.length < limit) {
    const start = match.index ?? 0;
    const tail = text.slice(start);
    const comma = tail.search(/,\s*(?=[A-Za-z])/);
    const stop = comma > 0 ? comma : Math.min(tail.length, 90);
    let clause = tail.slice(0, stop).replace(/\s+/g, " ").trim();
    clause = truncateWithEllipsis(clause, 88);
    if (clause.length < 6) continue;
    if (!/\d+(?:\.\d+)?\s*%/.test(clause)) continue;
    const key = clause.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clause);
  }
  return out;
}

function hasGlobalFaqHeading($: ReturnType<typeof load>) {
  return $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .some((el) => {
      if ($(el).closest("nav,[role='navigation']").length > 0) return false;
      const t = $(el).text().replace(/\s+/g, " ").trim();
      return /\b(frequently asked questions?|faqs?)\b/i.test(t);
    });
}

type CroFaqInsights = {
  questionSet: Set<string>;
  regionHeadingSamples: string[];
  hasFaqSectionHeading: boolean;
};

function extractCroFaqInsights($: ReturnType<typeof load>): CroFaqInsights {
  const questionSet = new Set<string>();
  const regionHeadingSamples: string[] = [];
  const faqHeadingHint = /\b(faqs?|frequently asked questions?|common questions?)\b/i;

  const addQuestion = (raw: string) => {
    const cleaned = raw.replace(/\s+/g, " ").replace(/^[\s›»]+/, "").trim();
    if (!looksLikeFaqQuestionText(cleaned)) return;
    questionSet.add(cleaned.toLowerCase());
  };

  const collectHeadingForRegion = (region: AnyNode) => {
    const local = $(region).find("h1,h2,h3,h4,h5").first().text().replace(/\s+/g, " ").trim();
    if (local) return local;
    return $(region).prevAll("h1,h2,h3,h4,h5").first().text().replace(/\s+/g, " ").trim();
  };

  const faqRegionNodes: AnyNode[] = [];
  const seenRegions = new Set<AnyNode>();
  const pushRegion = (el: AnyNode | undefined) => {
    if (!el || seenRegions.has(el)) return;
    seenRegions.add(el);
    faqRegionNodes.push(el);
  };

  $("[role='region'][aria-label*='faq' i], [role='region'][aria-label*='frequently asked' i], [aria-label*='faq' i], section#faq, [id*='faq' i]")
    .toArray()
    .forEach((el) => pushRegion(el));

  $("[data-faq], [class*='faq__question'], [class*='faq-question'], [class*='FaqItem'], [class*='accordion-faq']")
    .toArray()
    .forEach((el) => {
      if ($(el).closest("nav,[role='navigation']").length > 0) return;
      const host = $(el).closest("section,article,div");
      if (host.length > 0) pushRegion(host.get(0) as AnyNode);
      else pushRegion(el as AnyNode);
    });

  $("section,article,div")
    .toArray()
    .forEach((el) => {
      if ($(el).closest("nav,[role='navigation']").length > 0) return;
      const node = $(el);
      const headingTexts = node
        .find("h1,h2,h3,h4,h5")
        .toArray()
        .slice(0, 10)
        .map((h) => $(h).text().replace(/\s+/g, " ").trim())
        .filter(Boolean);
      if (headingTexts.some((h) => faqHeadingHint.test(h))) pushRegion(el);
    });

  faqRegionNodes.forEach((region) => {
    const heading = collectHeadingForRegion(region);
    if (heading && faqHeadingHint.test(heading)) regionHeadingSamples.push(heading);
  });

  const scanQuestionsInside = (region: AnyNode) => {
    const scope = $(region);
    scope
      .find(
        "details > summary, button[aria-expanded], button, [role='button'], [data-faq], .faq__question, h2, h3, h4, h5, h6",
      )
      .toArray()
      .forEach((el) => {
        const clone = $(el).clone();
        clone.find(".sr-only, .visually-hidden, [aria-hidden='true']").remove();
        const text = clone.text().replace(/\s+/g, " ").trim();
        if (/^(frequently asked questions?|faqs?)\s*$/i.test(text)) return;
        addQuestion(text);
      });
  };

  faqRegionNodes.forEach((region) => scanQuestionsInside(region));

  if (questionSet.size === 0 && regionHeadingSamples.length > 0) {
    faqRegionNodes.forEach((region) => {
      const scope = $(region);
      scope
        .find("button, [role='button'], a, span, div, p, li")
        .toArray()
        .forEach((el) => {
          const clone = $(el).clone();
          clone.find(".sr-only, .visually-hidden, [aria-hidden='true']").remove();
          const text = clone.text().replace(/\s+/g, " ").trim();
          if (!/\?/.test(text)) return;
          if (text.length < 12 || text.length > 320) return;
          const qParts = text.split("?").filter((part) => part.trim().length >= 8);
          qParts.forEach((part) => addQuestion(`${part.trim()}?`));
        });
    });
  }

  if (questionSet.size === 0 && faqRegionNodes.length > 0) {
    faqRegionNodes.forEach((region) => {
      const blockText = $(region).text().replace(/\s+/g, " ");
      const questionLike = blockText.match(/[^.!?]{12,220}\?(?=\s|$|[\s"'”’])/g) ?? [];
      if (questionLike.length >= 3) {
        questionLike.slice(0, 12).forEach((q) => addQuestion(q));
      }
    });
  }

  const uniqueHeadings = [...new Set(regionHeadingSamples)].slice(0, 4);
  const hasFaqSectionHeading = uniqueHeadings.length > 0 || hasGlobalFaqHeading($);
  return { questionSet, regionHeadingSamples: uniqueHeadings, hasFaqSectionHeading };
}

function enforceRecommendationTone(
  recommendation: string,
  status: "pass" | "fail" | "warn",
) {
  const normalized = recommendation
    .trim()
    .replace(/^(critical|high|medium|low)\s*:\s*/i, "");
  if (!normalized) return recommendation;

  if (status === "fail") {
    if (/^(add|replace|remove|reduce|move|rewrite|test)\b/i.test(normalized)) return normalized;
    if (/^keep\b/i.test(normalized)) {
      return normalized.replace(/^keep\b/i, "Add");
    }
    return `Improve this area: ${normalized}`;
  }

  return normalized;
}

function displayValue(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "(empty)";
  return normalized;
}

function hasNoindexDirective(value: string) {
  return /\bnoindex\b/i.test(value);
}

function parseMetaRobots($: ReturnType<typeof load>) {
  return $('meta[name="robots"]').attr("content")?.trim() ?? "";
}

function parseTitleDescription(html: string) {
  const $ = load(html);
  const titleFromHead = $("head > title").first().text().trim();
  return {
    title: titleFromHead || $("title").first().text().trim(),
    description: $('meta[name="description"]').attr("content")?.trim() ?? "",
    metaRobots: parseMetaRobots($),
  };
}

/** First heading in main, or first outside header/nav/footer landmarks (not document-order mega-menu). */
function firstStructuralHeadingTag($: ReturnType<typeof load>) {
  const main = $("main, [role='main']").first();
  if (main.length) {
    const h = main.find("h1,h2,h3,h4,h5,h6").first();
    if (h.length) return { tag: (h.get(0)?.tagName ?? "").toLowerCase(), found: true };
  }
  const candidate = $("h1,h2,h3,h4,h5,h6")
    .toArray()
    .find((node) => $(node).closest("header, nav, footer, [role='banner'], [role='navigation'], [role='contentinfo']").length === 0);
  return { tag: (candidate?.tagName ?? "").toLowerCase(), found: Boolean(candidate) };
}

function normalizeForDuplicate(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function formatDuplicateSamples(duplicates: Array<{ value: string; urls: string[] }>) {
  if (duplicates.length === 0) return "none";
  return duplicates
    .slice(0, 3)
    .map((dup) => `"${displayValue(dup.value)}" on ${formatList(dup.urls, "none", 2)}`)
    .join(" | ");
}

function statusFromCheckScore(checkScore: number): "pass" | "fail" | "warn" {
  if (checkScore >= 80) return "pass";
  if (checkScore >= 60) return "warn";
  return "fail";
}

function formatReport(
  targetUrl: string,
  keyword: string,
  score: number,
  checks: Array<{ title: string; priority: string; status: string; details: string; recommendation: string }>,
) {
  const reportKeywords = parseKeywordCandidates(keyword);
  const reportKeywordList = formatKeywordCandidatesAsQuotedList(
    reportKeywords.length > 0 ? reportKeywords : [keyword],
  );
  const isActionableIssue = (c: (typeof checks)[number]) =>
    c.status !== "pass" && c.status !== "skipped";
  const byPriority = {
    critical: checks.filter((c) => c.priority === "critical" && isActionableIssue(c)),
    high: checks.filter((c) => c.priority === "high" && isActionableIssue(c)),
    medium: checks.filter((c) => c.priority === "medium" && isActionableIssue(c)),
    low: checks.filter((c) => c.priority === "low" && isActionableIssue(c)),
  };

  const lines: string[] = [];
  lines.push(`# SEO Audit Report`);
  lines.push(``);
  lines.push(`- URL: ${targetUrl}`);
  lines.push(`- Target keyword(s): ${reportKeywordList}`);
  lines.push(`- Score: ${score}/100`);
  lines.push(``);
  lines.push(`## Executive Summary`);
  lines.push(
    score >= 80
      ? `Strong baseline with some targeted improvements needed.`
      : `Important on-page and technical issues are reducing ranking potential.`,
  );
  lines.push(``);
  lines.push(`## Checks`);
  checks.forEach((check, index) => {
    lines.push(``);
    lines.push(`### ${index + 1}. ${check.title}`);
    lines.push(`Status: ${check.status.toUpperCase()} · Priority: ${check.priority.toUpperCase()}`);
    lines.push(`Assessment: ${check.details}`);
    lines.push(`Recommendation: ${check.recommendation}`);
  });
  const skippedChecks = checks.filter((c) => c.status === "skipped");
  if (skippedChecks.length > 0) {
    lines.push(``);
    lines.push(`## Not measured (integrations)`);
    skippedChecks.forEach((check) => {
      lines.push(`- ${check.title}: ${check.details}`);
    });
  }
  lines.push(``);
  lines.push(`## Prioritized Action Plan`);
  lines.push(``);
  lines.push(`### Critical (Action Required Now)`);
  if (byPriority.critical.length === 0) lines.push(`- No critical issues found.`);
  byPriority.critical.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));
  lines.push(``);
  lines.push(`### High Impact (Action Required Soon)`);
  if (byPriority.high.length === 0) lines.push(`- No high-impact issues found.`);
  byPriority.high.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));
  lines.push(``);
  lines.push(`### Medium Impact (Address When Possible)`);
  if (byPriority.medium.length === 0) lines.push(`- No medium-impact issues found.`);
  byPriority.medium.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));
  lines.push(``);
  lines.push(`### Low Impact (Fix Later)`);
  if (byPriority.low.length === 0) lines.push(`- No low-priority strategic items found.`);
  byPriority.low.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));

  return lines.join("\n");
}

function formatCroReport(
  targetUrl: string,
  score: number,
  checks: Array<{ title: string; priority: string; status: string; details: string; recommendation: string }>,
  scoreBreakdown?: CroScoreBreakdown,
) {
  const croPriorityRank = (priority: string) => {
    if (priority === "critical") return 4;
    if (priority === "high") return 3;
    if (priority === "medium") return 2;
    return 1;
  };
  const byPriority = {
    critical: checks.filter((c) => c.priority === "critical" && c.status === "fail"),
    high: checks.filter((c) => c.priority === "high" && c.status === "fail"),
    medium: checks.filter((c) => c.priority === "medium" && c.status === "fail"),
    low: checks.filter((c) => c.priority === "low" && c.status === "fail"),
  };

  const lines: string[] = [];
  lines.push(`# CRO Audit Report`);
  lines.push(``);
  lines.push(`- URL: ${targetUrl}`);
  lines.push(`- Score: ${score}/100`);
  if (scoreBreakdown) {
    lines.push(`- Score formula: ${scoreBreakdown.formula}`);
    lines.push(`- Total deductions: ${scoreBreakdown.totalPenalty} points`);
  }
  lines.push(``);
  if (scoreBreakdown) {
    lines.push(`## Score Breakdown`);
    lines.push(`<details>`);
    lines.push(`<summary>Show deduction details</summary>`);
    lines.push(``);
    if (scoreBreakdown.deductions.length === 0) {
      lines.push(`- No deductions applied.`);
    } else {
      scoreBreakdown.deductions.forEach((entry) =>
        lines.push(
          `- ${entry.title} (${entry.priority.toUpperCase()} ${entry.status.toUpperCase()}): -${entry.penalty}`,
        ),
      );
    }
    lines.push(``);
    lines.push(`</details>`);
    lines.push(``);
  }
  const highCriticalFails = checks
    .filter((c) => c.status === "fail" && (c.priority === "critical" || c.priority === "high"))
    .sort((a, b) => croPriorityRank(b.priority) - croPriorityRank(a.priority));
  const topRisks = highCriticalFails.slice(0, 7);
  const hiddenRiskCount = Math.max(highCriticalFails.length - topRisks.length, 0);
  lines.push(``);
  lines.push(`## Critical Conversion Risks`);
  if (topRisks.length === 0) {
    lines.push(`- No critical conversion blockers detected.`);
  } else {
    topRisks.forEach((risk) => {
      lines.push(`- ${risk.title}: ${risk.recommendation}`);
    });
    if (hiddenRiskCount > 0) {
      lines.push(`- +${hiddenRiskCount} more high/critical fail items in full checks list.`);
    }
  }
  lines.push(``);
  lines.push(`## Checks`);
  checks.forEach((check, index) => {
    lines.push(``);
    lines.push(`### ${index + 1}. ${check.title}`);
    lines.push(`Status: ${check.status.toUpperCase()} · Priority: ${check.priority.toUpperCase()}`);
    lines.push(`Assessment: ${check.details}`);
    lines.push(`Recommendation: ${check.recommendation}`);
  });
  lines.push(``);
  lines.push(`## Prioritized Action Plan`);
  lines.push(``);
  lines.push(`### Critical (Action Required Now)`);
  if (byPriority.critical.length === 0) lines.push(`- No critical issues found.`);
  byPriority.critical.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));
  lines.push(``);
  lines.push(`### High Impact (Action Required Soon)`);
  if (byPriority.high.length === 0) lines.push(`- No high-impact issues found.`);
  byPriority.high.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));
  lines.push(``);
  lines.push(`### Medium Impact (Address When Possible)`);
  if (byPriority.medium.length === 0) lines.push(`- No medium-impact issues found.`);
  byPriority.medium.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));
  lines.push(``);
  lines.push(`### Low Impact (Fix Later)`);
  if (byPriority.low.length === 0) lines.push(`- No low-priority issues found.`);
  byPriority.low.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));

  return lines.join("\n");
}

async function buildCroChecks($: ReturnType<typeof load>, bodyText: string, targetUrl: string) {
  const h1Node = $("h1").first();
  const h1Text = h1Node.text().trim();
  const actionCtaRegex =
    /(get started|get a demo|buy|order|start|sign up|subscribe|shop|audit|checkout|book|trial|start for free|talk to sales|contact sales|speak to sales|talk with sales|get insights|view plans?)/i;
  const hasButtonLikeStyle = (el: AnyNode) => {
    const className = ($(el).attr("class") ?? "").toLowerCase();
    const style = ($(el).attr("style") ?? "").toLowerCase();
    const role = ($(el).attr("role") ?? "").toLowerCase();
    if (/(btn|button|cta|primary|action|bg-)/i.test(className)) return true;
    if (role === "button") return true;
    if (/background(?:-color)?\s*:\s*(?!transparent|inherit)/i.test(style)) return true;
    return false;
  };
  const getInteractiveText = (el: AnyNode) => {
    const clone = $(el).clone();
    clone.find(".sr-only, .visually-hidden, [aria-hidden='true']").remove();
    const visibleText = clone.text().replace(/\s+/g, " ").trim();
    const value = ($(el).attr("value") ?? "").replace(/\s+/g, " ").trim();
    const ariaLabel = ($(el).attr("aria-label") ?? "").replace(/\s+/g, " ").trim();
    return visibleText || value || ariaLabel;
  };
  const formatDisplayLabel = (value: string) => toTitleCaseDisplay(truncateWithEllipsis(displayValue(value), 40));
  const h1PrimaryContainer = h1Node.closest("section,article,div,header");
  const h1FallbackContainer = h1Node.closest("div");
  const collectScopeCtas = (scope: Cheerio<AnyNode>) =>
    scope
      .find("a,button,[role='button'],input[type='submit'],input[type='button']")
      .toArray()
      .map((el) => getInteractiveText(el))
      .filter((text) => actionCtaRegex.test(text));
  const firstHeroLikeSection = $("section,article,div")
    .toArray()
    .find((el) => /h1|hero|show up|be found/i.test($(el).text()));
  const h1Section = h1Node.closest("section");
  const preHeroSections: AnyNode[] = [];
  if (h1Section.length > 0) {
    let walk = h1Section.prev("section");
    let steps = 0;
    while (walk.length > 0 && steps < 2) {
      preHeroSections.unshift(walk.get(0) as AnyNode);
      walk = walk.prev("section");
      steps += 1;
    }
  }
  const heroCtaScope =
    preHeroSections.length > 0 || h1Section.length > 0
      ? $([...preHeroSections, ...(h1Section.length ? [h1Section.get(0) as AnyNode] : [])])
      : h1PrimaryContainer.length > 0
        ? h1PrimaryContainer
        : h1FallbackContainer;
  let heroCtas = collectScopeCtas(heroCtaScope);
  if (heroCtas.length === 0) {
    heroCtas = collectScopeCtas(h1PrimaryContainer);
  }
  if (heroCtas.length === 0) {
    heroCtas = collectScopeCtas(h1FallbackContainer);
  }
  if (heroCtas.length === 0 && firstHeroLikeSection) {
    heroCtas = collectScopeCtas($(firstHeroLikeSection));
  }
  const uniqueHeroCtas = [...new Set(heroCtas.map((text) => text.toLowerCase()))];
  const heroCtaDisplaySamples = [...new Set(heroCtas.map((text) => formatDisplayLabel(text)))];
  const hasDualHeroCta = uniqueHeroCtas.length >= 2;
  const ctaInHero = uniqueHeroCtas.length > 0;
  const heroCtaCount = heroCtas.length;
  const heroCtaChoiceOverload = uniqueHeroCtas.length > 2;
  const allH1Texts = $("h1")
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const multipleCompetingH1 = allH1Texts.length > 1;
  const eyebrowBannerHeadline =
    preHeroSections.length > 0
      ? $(preHeroSections[0])
          .find("h2,h3,h4")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim()
      : "";
  const heroTextSource = h1PrimaryContainer.length > 0 ? h1PrimaryContainer : h1FallbackContainer;
  const heroText = (heroTextSource.length > 0 ? heroTextSource.text() : $("body").text()).replace(/\s+/g, " ").trim();
  const sectionNodes = $("section").toArray();
  const earlySectionText = sectionNodes
    .slice(0, 2)
    .map((section) => $(section).text())
    .join(" ");
  const earlyText = `${heroText} ${earlySectionText}`.replace(/\s+/g, " ").trim();
  const footerText = $("footer").text().replace(/\s+/g, " ").trim();
  const heroCustomerCountMatches = collectMatches(
    earlyText,
    /((?:trusted by|used by|customers|businesses|brands|teams).{0,48}\d[\d,.]*\+?)|(\d[\d,.]*\+?\s*(?:users?|customers?|businesses|brands|teams)\s+(?:joined|use|using|trust|trusted|served)?)/gi,
    6,
  );
  const customerCountMatches = collectMatches(
    bodyText,
    /\b\d{1,3}(?:,\d{3})+\+?\s+(brands|customers|companies|agencies|users|businesses|marketers)\b/gi,
    8,
  );
  const testimonialSignatureSet = new Set<string>();
  $("section,article,div,blockquote")
    .toArray()
    .forEach((el) => {
      const node = $(el);
      const text = node.text().replace(/\s+/g, " ").trim();
      const hasPersonSignal = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(text);
      const hasRoleSignal = /\b(vp|director|manager|founder|ceo|head|specialist|marketing)\b/i.test(text);
      const hasCompanySignal = /\bat\b|\bof\b/i.test(text);
      const hasMediaSignal = node.find("img").length > 0 || node.find("blockquote").length > 0;
      if (!(hasPersonSignal && hasRoleSignal && hasCompanySignal && hasMediaSignal)) return;

      const quoteText = node.find("blockquote,p").first().text().replace(/\s+/g, " ").trim() || text.slice(0, 180);
      const attributionText = node
        .find("h3,h4,strong,small,figcaption,a")
        .toArray()
        .map((n) => $(n).text().replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(" | ");
      const signature = `${quoteText}||${attributionText}`.toLowerCase();
      if (signature) testimonialSignatureSet.add(signature);
    });
  const namedTestimonialBlockCount = Math.min(testimonialSignatureSet.size, 12);
  const hasNamedTestimonialBlocks = namedTestimonialBlockCount >= 1;
  const logoBarSignatureSet = new Set<string>();
  $("section,article,div")
    .toArray()
    .forEach((el) => {
      const node = $(el);
      const images = node.find("img[alt]").toArray();
      if (images.length < 6) return;
      const altWithBrandLikeText = images
        .map((img) => ($(img).attr("alt") ?? "").trim())
        .filter((alt) => alt.length >= 2 && !/icon|menu|arrow|chevron|hero|illustration/i.test(alt));
      if (altWithBrandLikeText.length < 5) return;
      const textWordCount = node.text().replace(/\s+/g, " ").trim().split(/\s+/).filter(Boolean).length;
      if (textWordCount > 120) return;
      const signature = altWithBrandLikeText.slice(0, 8).join("|").toLowerCase();
      if (signature) logoBarSignatureSet.add(signature);
    });
  const logoBarCount = Math.min(logoBarSignatureSet.size, 6);
  const hasLogoBar = logoBarCount > 0;
  const statBlockMatches = $("h2,h3,strong")
    .toArray()
    .map((el) => {
      const metric = $(el).text().replace(/\s+/g, " ").trim();
      if (!/\d/.test(metric)) return "";
      const descriptor = ($(el).next().text() || "").replace(/\s+/g, " ").trim();
      const descriptorWords = descriptor.split(/\s+/).filter(Boolean).length;
      if (!descriptor || descriptorWords > 6) return "";
      return `${metric} ${descriptor}`;
    })
    .filter(Boolean)
    .slice(0, 10);
  const customerProxyFromStats = statBlockMatches.filter((entry) =>
    /\b(users?|customers?|businesses|companies|teams|active|daily)\b/i.test(entry),
  );
  const customerProofMatches = [...new Set([...customerCountMatches, ...heroCustomerCountMatches, ...customerProxyFromStats])];
  const hasStatBlocks = statBlockMatches.length >= 2;
  const trustClusterCount = [customerProofMatches.length > 0, hasNamedTestimonialBlocks, hasLogoBar, hasStatBlocks].filter(Boolean).length;
  const supportCueMatches = collectMatches(
    bodyText,
    /contact|help|support|chat|customer service|get in touch|help hub|help center|faq|knowledge base/gi,
    6,
  );
  const trustSignalsCount = trustClusterCount;
  const schemaScripts = $('script[type="application/ld+json"]').toArray();
  const parsedSchemaTypes: string[] = [];
  schemaScripts.forEach((script) => {
    try {
      const parsed = JSON.parse($(script).text()) as unknown;
      parsedSchemaTypes.push(...collectJsonLdTypes(parsed));
    } catch {
      // ignore parse failures in CRO pass and rely on available schema samples
    }
  });
  const schemaTypeSamples = [...new Set(parsedSchemaTypes.map((type) => type.toLowerCase()))].slice(0, 8);
  const hasSchema = schemaScripts.length > 0;
  const ogTitleValue = $('meta[property="og:title"]').attr("content")?.trim() ?? "";
  const hasOgTitle = Boolean(ogTitleValue);
  const twitterCardValue = $('meta[name="twitter:card"]').attr("content")?.trim() ?? "";
  const hasTwitterCard = Boolean(twitterCardValue);
  const headerSupportAnchors = $("header a, [role='banner'] a")
    .toArray()
    .filter((el) => {
      const t = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
      const h = ($(el).attr("href") ?? "").toLowerCase();
      if (t.length > 72) return false;
      return (
        /\/(contact|support|help|chat|customer|demo)/i.test(h) ||
        /^(contact|help|support|chat)\b/i.test(t) ||
        /\b(contact sales|talk to sales|customer support)\b/i.test(t)
      );
    });
  const hasSupportInHeader = headerSupportAnchors.length > 0;
  const headerSupportSamples = headerSupportAnchors
    .map((el) => formatDisplayLabel(getInteractiveText(el)))
    .filter(Boolean)
    .slice(0, 4);
  const schemaFaqCount = schemaScripts.reduce((count, script) => {
    try {
      const parsed = JSON.parse($(script).text()) as unknown;
      const walk = (node: unknown): number => {
        if (!node || typeof node !== "object") return 0;
        if (Array.isArray(node)) return node.reduce((sum, item) => sum + walk(item), 0);
        const record = node as Record<string, unknown>;
        const typeValue = record["@type"];
        const types = Array.isArray(typeValue) ? typeValue.map((item) => String(item).toLowerCase()) : [String(typeValue ?? "").toLowerCase()];
        let localCount = 0;
        if (types.includes("faqpage")) {
          const mainEntity = record.mainEntity;
          if (Array.isArray(mainEntity)) {
            localCount += mainEntity.filter((entry) => {
              if (!entry || typeof entry !== "object") return false;
              const entryType = (entry as Record<string, unknown>)["@type"];
              return /question/i.test(String(entryType ?? ""));
            }).length;
          }
        }
        const nestedValues = Object.values(record) as unknown[];
        const nestedCount = nestedValues.reduce<number>((sum, value) => sum + walk(value), 0);
        return localCount + nestedCount;
      };
      return count + walk(parsed);
    } catch {
      return count;
    }
  }, 0);
  const {
    questionSet: faqQuestionSet,
    regionHeadingSamples: faqRegionHeadingSamples,
    hasFaqSectionHeading,
  } = extractCroFaqInsights($);
  const faqQuestionCount = faqQuestionSet.size;
  const faqHeadingSamples = [...faqQuestionSet].slice(0, 5).map((text) => toTitleCaseDisplay(text));
  const analyticsSignalMatches = collectMatches($.html() ?? "", /googletagmanager|gtag\(|datalayer|fbq\(|clarity|hotjar|analytics/gi, 8);
  const hasAnalytics = analyticsSignalMatches.length > 0;
  const hasProblemFraming = /(spreadsheets?|overkill|manual|slow|inefficient|stockouts?|friction|bottleneck|struggling)/i.test(
    bodyText,
  );
  const hasBeforeAfterComparison = /(without|with|before|after|vs\.?)/i.test(bodyText) && /(seconds?|minutes?|hours?|days?)/i.test(
    bodyText,
  );
  const hasLiveTrendLanguage = /(live trends?|trending|viral|top posts?|view count|real-time)/i.test(bodyText);
  const viewCountSignals = (bodyText.match(/\b\d+(?:[.,]\d+)?\s?(?:k|m|b)?\s?(?:views?|watches?)\b/gi) ?? []).length;
  const hasProductImageDensity = $("img").length >= 8;
  const hasLiveProductProof = hasLiveTrendLanguage && (viewCountSignals >= 2 || hasProductImageDensity);
  const quantifiedPercentageMatches = collectMatches(bodyText, /\b\+?\d+(?:\.\d+)?\s?%/gi, 80);
  const quantifiedSentenceMatches = collectSentenceMatches(bodyText, /\b\+?\d+(?:\.\d+)?\s?%/gi, 20);
  const quantifiedStatClauses = extractPercentStatClauses(bodyText, 6);
  const quantifiedDisplaySnippets =
    quantifiedStatClauses.length > 0 ? quantifiedStatClauses : collectNumericMetricSnippets(bodyText, 5);
  const quantifiedScaleMatches = collectMatches(bodyText, /\b\d+(?:\.\d+)?\s?[KMBT]\+?\b/gi, 80);
  const quantifiedMultiplierMatches = collectMatches(bodyText, /\b\d+x\b/gi, 80);
  const quantifiedEntityMatches = collectMatches(
    bodyText,
    /\b\d{2,}\+?\s+(years|customers|users|brands|teams|integrations|countries|languages)\b/gi,
    80,
  );
  const headingDescriptorMatches = $("strong,h2,h3")
    .toArray()
    .map((el) => {
      const metricText = $(el).text().replace(/\s+/g, " ").trim();
      if (!/\d/.test(metricText)) return "";
      const siblingText = ($(el).next().text() || "").replace(/\s+/g, " ").trim();
      const siblingWordCount = siblingText.split(/\s+/).filter(Boolean).length;
      if (!siblingText || siblingWordCount > 4) return "";
      return `${metricText} ${siblingText}`;
    })
    .filter(Boolean)
    .slice(0, 80);
  const quantifiedOutcomeMatches = [
    ...quantifiedPercentageMatches,
    ...quantifiedScaleMatches,
    ...quantifiedMultiplierMatches,
    ...quantifiedEntityMatches,
    ...headingDescriptorMatches,
  ];
  const quantifiedOutcomeCount = new Set(quantifiedOutcomeMatches.map((item) => item.toLowerCase())).size;
  const quantifiedMetricClauseCount = quantifiedStatClauses.length;
  const origin = safeUrl(targetUrl, targetUrl)?.origin ?? "";
  const pricingPathCandidates = ["/pricing", "/plans", "/prices"];
  const pricingPageScans = await Promise.all(
    pricingPathCandidates.map(async (path) => {
      if (!origin) return { path, fetched: false, hasComparisonSignals: false, hasThreePlusPlans: false };
      try {
        const html = await fetchText(`${origin}${path}`);
        if (!html) return { path, fetched: false, hasComparisonSignals: false, hasThreePlusPlans: false };
        const page = load(html);
        const text = page("body").text().replace(/\s+/g, " ").trim();
        const hasComparisonSignals =
          page("table").length > 0 ||
          /(compare plans|compare|which plan|plan comparison|features matrix|side-by-side|pricing table)/i.test(text);
        const planSignals = (text.match(/\b(plan|starter|standard|pro|premium|enterprise|business|team|basic)\b/gi) ?? []).length;
        const priceSignals = (text.match(/[$€£]\s?\d+(?:[.,]\d+)?/g) ?? []).length;
        const hasThreePlusPlans = planSignals >= 3 || priceSignals >= 3;
        return { path, fetched: true, hasComparisonSignals, hasThreePlusPlans };
      } catch {
        return { path, fetched: false, hasComparisonSignals: false, hasThreePlusPlans: false };
      }
    }),
  );
  const scannedPricingPaths = pricingPageScans.filter((scan) => scan.fetched).map((scan) => scan.path);
  const comparisonPaths = pricingPageScans.filter((scan) => scan.hasComparisonSignals).map((scan) => scan.path);
  const threePlusPlanPaths = pricingPageScans.filter((scan) => scan.hasThreePlusPlans).map((scan) => scan.path);
  const pricingSections = $("section,article,div")
    .toArray()
    .filter((el) => /(pricing|plan|billing|subscription|free|starter|professional|enterprise)/i.test($(el).text()));
  const pricingSectionText = pricingSections
    .slice(0, 4)
    .map((el) => $(el).text())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const energyModelMentions = (pricingSectionText.match(/\b(energy|credits?|tokens?|points?)\b/gi) ?? []).length;
  const pricingOutcomeAnchors = (pricingSectionText.match(/\b(videos?|requests?|analyses?|posts?|teams?|seats?|users?)\b/gi) ?? [])
    .length;
  const hasAbstractPricingModel = energyModelMentions >= 2 && pricingOutcomeAnchors < 3;
  const genericPlanNameCount = (pricingSectionText.match(/\b(light|standard|business|basic|pro|starter|premium)\b/gi) ?? [])
    .length;
  const audiencePlanNameCount = (pricingSectionText.match(/\b(solo|creator|agency|team|enterprise|brand|growing)\b/gi) ?? [])
    .length;
  const planHeadingRegex = /\b(free|starter|pro|professional|enterprise|business|team|basic|plus)\b/i;
  const priceTokenRegex = /\$\d|\bfree\b|\/mo(?:nth)?\b|per seat/i;
  let pricingTableTierCount = 0;
  $("table")
    .toArray()
    .forEach((el) => {
      if (!/(plan|pricing|features?|compare|included)/i.test($(el).text())) return;
      const cells = $(el)
        .find("tr")
        .first()
        .find("th,td")
        .toArray()
        .map((cell) => $(cell).text().replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const tierCells = cells.filter((cell) => planHeadingRegex.test(cell) || priceTokenRegex.test(cell));
      if (tierCells.length >= 2) pricingTableTierCount = Math.max(pricingTableTierCount, tierCells.length);
    });
  const hasPricingTable = pricingTableTierCount >= 2;
  const hasPricingFeatureList = (card: ReturnType<typeof $>) =>
    card.find("ul,ol,li").length > 0 ||
    card
      .find("p,div,span")
      .toArray()
      .map((el) => $(el).text().replace(/\s+/g, " ").trim())
      .filter((text) => /^[-•]/.test(text) || text.split(/\s+/).length > 4).length >= 3;
  const getCardSignature = (el: AnyNode) => {
    const tag = ("tagName" in el ? (el as { tagName?: string }).tagName : "")?.toLowerCase() ?? "";
    const classTokens = (($(el).attr("class") ?? "").toLowerCase().split(/\s+/).filter(Boolean)).slice(0, 6);
    return [tag, ...classTokens].join(".");
  };
  const signatureSimilarity = (a: string, b: string) => {
    const aSet = new Set(a.split(".").filter(Boolean));
    const bSet = new Set(b.split(".").filter(Boolean));
    const intersection = [...aSet].filter((token) => bSet.has(token)).length;
    const union = new Set([...aSet, ...bSet]).size;
    if (union === 0) return 0;
    return intersection / union;
  };
  let structuredPricingTierCount = 0;
  let hasStructuredPricingMatrix = false;
  let structuredCardNodes: AnyNode[] = [];
  pricingSections.forEach((section) => {
    const sectionNode = $(section);
    const candidateCards = sectionNode
      .children("div,article,li,section")
      .toArray()
      .filter((cardEl) => {
        const card = $(cardEl);
        const cardText = card.text().replace(/\s+/g, " ").trim();
        const headingText = card.find("h1,h2,h3,h4,strong").first().text().replace(/\s+/g, " ").trim();
        const hasPlanHeading = planHeadingRegex.test(headingText) || (headingText.length > 0 && priceTokenRegex.test(cardText));
        const hasPriceToken = priceTokenRegex.test(cardText);
        return hasPlanHeading && hasPriceToken && hasPricingFeatureList(card);
      });
    if (candidateCards.length < 3) return;
    const signatures = candidateCards.map((cardEl) => getCardSignature(cardEl));
    const baseSignature = signatures[0] ?? "";
    const avgSimilarity =
      signatures.slice(1).reduce((sum, signature) => sum + signatureSimilarity(baseSignature, signature), 0) /
      Math.max(signatures.length - 1, 1);
    if (avgSimilarity > 0.7) {
      hasStructuredPricingMatrix = true;
      if (candidateCards.length >= structuredPricingTierCount) {
        structuredPricingTierCount = candidateCards.length;
        structuredCardNodes = candidateCards;
      }
    }
  });
  const onPageMatrixDetected = hasPricingTable || hasStructuredPricingMatrix;
  const pricingPathSignalCount = comparisonPaths.length;
  const detectedPlanTierCount = Math.max(
    structuredPricingTierCount,
    pricingTableTierCount,
    threePlusPlanPaths.length > 0 ? 3 : 0,
  );
  const pricingMatrixKind = hasStructuredPricingMatrix
    ? "repeated pricing-card row"
    : hasPricingTable
      ? "tabular pricing header row"
      : "none";
  const pricingCadenceHint = /\/mo|\/month|\/yr|\/year|per seat|monthly|annual|annually|\/mo\//i.test(pricingSectionText);
  const comparePlansHint = /compare\s+plans|plan comparison|feature(s)?\s+matrix|side[- ]by[- ]side|what(?:'s| is) included/i.test(
    `${pricingSectionText} ${bodyText.slice(0, 24_000)}`,
  );
  let pricingComparabilityHits = 0;
  const pricingComparabilityNotes: string[] = [];
  if (structuredCardNodes.length >= 2) {
    const withMoney = structuredCardNodes.filter((ce) => /[$€£]|\bfree\b|\/mo|per seat|\/year/i.test($(ce).text())).length;
    if (withMoney >= Math.min(structuredCardNodes.length, 3)) {
      pricingComparabilityHits += 1;
      pricingComparabilityNotes.push("price or cadence tokens inside tier cards");
    }
    const withFeatures = structuredCardNodes.filter((ce) => hasPricingFeatureList($(ce))).length;
    if (withFeatures >= 2) {
      pricingComparabilityHits += 1;
      pricingComparabilityNotes.push("parallel feature/bullet lists across tiers");
    }
  }
  if (pricingCadenceHint) {
    pricingComparabilityHits += 1;
    pricingComparabilityNotes.push("billing cadence language (/mo, per seat, annual)");
  }
  if (comparePlansHint || hasPricingTable) {
    pricingComparabilityHits += 1;
    pricingComparabilityNotes.push("compare / matrix / table cues");
  }
  const strongPricingLayout = onPageMatrixDetected && detectedPlanTierCount >= 3;
  const pricingComparabilityStrong = strongPricingLayout && pricingComparabilityHits >= 2;
  const pricingComparabilityWeak = strongPricingLayout && !pricingComparabilityStrong;
  const testimonialSectionText = $("section,article,div")
    .toArray()
    .filter((el) => /(testimonial|case stud|what .* say|customer)/i.test($(el).text()))
    .slice(0, 6)
    .map((el) => $(el).text())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const testimonialOutcomeSignalCount = (testimonialSectionText.match(/(\d{1,3}(?:[.,]\d+)?\s?%|\d+(?:\.\d+)?x|\$\d[\d,]*(?:\+\s*)?)/gi) ?? [])
    .length;
  const testimonialNodes = $("section,article,div")
    .toArray()
    .filter((el) => /(testimonial|case stud|what .* say|customer|review)/i.test($(el).text()));
  const hasThirdPartyReviewBadge = /(g2|trustpilot|capterra|getapp|product hunt|google reviews?|appsumo|clutch)/i.test(
    testimonialSectionText,
  );
  const testimonialExternalReviewLinks = testimonialNodes
    .flatMap((el) => $(el).find("a[href]").toArray())
    .map((el) => $(el).attr("href") ?? "")
    .filter((href) => /trustpilot|g2|capterra|getapp|producthunt|google/i.test(href)).length;
  const footerNode = $("footer, [role='contentinfo']").first();
  const excludedFooterLinkRegex =
    /user group|community|blog|about|careers|contact|privacy|terms|accessibility|sitemap|facebook|instagram|linkedin|youtube|twitter|x\.com|cookie|legal|investor|partner/i;
  const footerActionRegex =
    /\b(get|start|try|buy|book|request|download|contact|schedule|sign up|subscribe|learn|demo|free trial|log in|login)\b/i;
  const footerIntentHrefRegex = /\/(demo|trial|signup|sign-up|pricing|checkout|get-started|book|login|log-in)/i;
  const preFooterSections =
    footerNode.length > 0 ? (footerNode.prevAll("section").slice(0, 4).toArray() as AnyNode[]) : [];
  const preFooterAdjacentClassBlocks =
    footerNode.length > 0
      ? footerNode
          .prevAll("section,div,article")
          .slice(0, 4)
          .toArray()
          .filter((el) => /cta|callout|banner/i.test($(el).attr("class") ?? ""))
      : [];
  const tailSectionNodes = sectionNodes.slice(-4) as AnyNode[];
  const footerZoneNodes = [
    ...new Set<AnyNode>([
      ...(footerNode.length > 0 ? [footerNode.get(0) as AnyNode] : []),
      ...preFooterSections,
      ...preFooterAdjacentClassBlocks,
      ...tailSectionNodes,
    ]),
  ];
  const footerScopeText = footerZoneNodes
    .map((region) => $(region).text().replace(/\s+/g, " ").trim())
    .join(" ");
  const footerCandidates = footerZoneNodes.flatMap((region) =>
    $(region)
      .find("a,button,[role='button'],input[type='submit'],input[type='button']")
      .toArray(),
  );
  const isFooterNavColumnLink = (el: AnyNode) => {
    const node = $(el);
    const foot = node.closest("footer");
    if (!foot.length) return false;
    if (node.closest("footer nav, footer [role='navigation'], footer [class*='footer-menu'], footer [class*='Footer']").length)
      return true;
    const ul = node.closest("ul");
    return ul.length > 0 && ul.find("a").length >= 8;
  };
  const footerCtaSampleSet = new Set<string>();
  let footerCtaHasRiskInLabel = false;
  footerCandidates.forEach((el) => {
    const text = getInteractiveText(el);
    if (!text || text.length < 2 || text.length > 96) return;
    if (/^see all\b/i.test(text)) return;
    if (/\b(hubspot for startups|free business tools|user group)\b/i.test(text) && !hasButtonLikeStyle(el)) return;
    if (excludedFooterLinkRegex.test(text)) return;
    const href = ($(el).attr("href") ?? $(el).attr("formaction") ?? "").toLowerCase();
    const strongHref = footerIntentHrefRegex.test(href);
    const strongText = footerActionRegex.test(text) || actionCtaRegex.test(text);
    if (!(strongText || strongHref)) return;
    const tag = (el.tagName ?? "").toLowerCase();
    if (isFooterNavColumnLink(el) && tag === "a" && !hasButtonLikeStyle(el) && !strongHref) return;
    if (!(hasButtonLikeStyle(el) || strongHref || tag === "button" || tag === "input" || $(el).attr("role") === "button"))
      return;
    if (collectRiskReversalMatches(text, 3).length > 0) footerCtaHasRiskInLabel = true;
    footerCtaSampleSet.add(formatDisplayLabel(text));
  });
  const footerCtaTexts = [...footerCtaSampleSet];
  const combinedLateFunnelText = `${heroText} ${footerScopeText}`.replace(/\s+/g, " ").trim();
  const combinedRiskMatches = collectRiskReversalMatches(combinedLateFunnelText, 10);
  const footerHasContextLine =
    combinedRiskMatches.length > 0 ||
    footerCtaHasRiskInLabel ||
    /(setup in|minutes|risk-free|no commitment|money[- ]back)/i.test(combinedLateFunnelText);
  const hasSecurityComplianceBadge = /(aicpa|soc\s?2?|iso\s?27001|gdpr|compliance|security certified)/i.test(
    footerText,
  );
  const storySectionText = $("section,article,div")
    .toArray()
    .filter((el) => /(our story|about|founder|team|mission)/i.test($(el).text()))
    .slice(0, 5)
    .map((el) => $(el).text())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const storyLength = storySectionText.length;
  const storyCredibilitySignals = (storySectionText.match(/\b(founder|years?|experience|built|background|ceo|co-founder|worked|launched)\b/gi) ?? [])
    .length;
  const hasAffiliateSignal = /\baffiliate\b/i.test(bodyText);
  const affiliateInFooterOnly = hasAffiliateSignal && !/(affiliate)/i.test(bodyText.replace(footerText, ""));
  const faqDepthStatus: "pass" | "fail" =
    faqQuestionCount >= 1 || schemaFaqCount >= 1 || hasFaqSectionHeading ? "pass" : "fail";
  const checksByKey: Record<string, CheckResult> = {
    "hero-clarity": {
      key: "hero-clarity",
      score: h1Text.length >= 10 && ctaInHero ? 88 : h1Text.length >= 10 ? 56 : 28,
      details: `Primary H1 (document order): "${displayValue(h1Text)}".${multipleCompetingH1 ? ` Additional H1 elements: ${formatList(allH1Texts.slice(1), "none", 3)} (multiple competing hero messages — review banner vs product headline hierarchy).` : ""}${eyebrowBannerHeadline ? ` Preceding banner/eyebrow heading: "${displayValue(eyebrowBannerHeadline)}".` : ""} Hero CTA detected: ${yesNo(ctaInHero)}. Hero CTA samples: ${formatList(heroCtaDisplaySamples, "none", 5)}.`,
      recommendation:
        "Critical: ensure headline clearly explains what the product is and keep a strong primary CTA visible above the fold.",
    },
    "hero-dual-cta": {
      key: "hero-dual-cta",
      score: hasDualHeroCta ? 86 : ctaInHero ? 58 : 34,
      ...(heroCtaChoiceOverload ? { status: "warn" as const } : {}),
      details: `Unique hero CTA variants detected: ${uniqueHeroCtas.length}; raw matches in hero scope: ${heroCtaCount}. (Hero scope includes up to two sections above the H1 section.) Hero CTAs: ${formatList(heroCtaDisplaySamples, "none", 6)}.${heroCtaChoiceOverload ? " Medium: choice overload risk — three or more competing actions with no deterministic visual-primary signal in HTML; promote one primary CTA through size/contrast." : ""}`,
      recommendation:
        heroCtaChoiceOverload
          ? "Reduce or visually rank hero CTAs so one primary action is obvious; keep secondary intents clearly secondary."
          : hasDualHeroCta
            ? "Dual CTA strategy is present. Keep primary vs secondary action hierarchy visually clear."
            : "Add complementary hero CTAs (e.g., self-serve + assisted/demo) to capture different buyer intent stages.",
    },
    "problem-framing": {
      key: "problem-framing",
      score: hasProblemFraming ? 84 : 52,
      details: `Problem-framing language detected: ${yesNo(hasProblemFraming)}.`,
      recommendation:
        hasProblemFraming
          ? "Problem framing is present. Keep connecting pain points to specific outcomes."
          : "Add a clear pain-point section early (before deep feature details) to frame urgency and relevance.",
    },
    "quantified-outcomes": {
      key: "quantified-outcomes",
      score:
        quantifiedMetricClauseCount >= 2 && customerProofMatches.length > 0
          ? 86
          : quantifiedMetricClauseCount > 0 || quantifiedOutcomeCount > 0
            ? 68
            : 38,
      status:
        quantifiedMetricClauseCount >= 2 && customerProofMatches.length > 0
          ? "pass"
          : quantifiedMetricClauseCount > 0 || quantifiedOutcomeCount > 0
            ? "warn"
            : "fail",
      details: `Distinct %-stat clauses extracted: ${quantifiedMetricClauseCount}. (Broader numeric cue count, deduped: ${quantifiedOutcomeCount}.) Display samples: ${formatList(
        quantifiedDisplaySnippets.length > 0
          ? quantifiedDisplaySnippets
          : quantifiedSentenceMatches.length > 0
            ? quantifiedSentenceMatches
            : quantifiedOutcomeMatches.slice(0, 8),
        "none",
        5,
      )}. Customer/volume cues: ${formatList(customerProofMatches, "none", 5)}.`,
      recommendation:
        quantifiedMetricClauseCount >= 2 && customerProofMatches.length > 0
          ? "Keep quantified outcomes and customer-volume proof close to hero and primary CTA areas."
          : quantifiedMetricClauseCount > 0 || quantifiedOutcomeCount > 0
            ? `Add customer-volume proof near the hero; keep each stat as one clear clause (avoid counting one sentence as many duplicate cues).`
            : "Add quantified outcomes (percentages, multipliers, or totals) and at least one customer-volume proof stat.",
    },
    "before-after-comparison": {
      key: "before-after-comparison",
      score: hasBeforeAfterComparison ? 82 : 56,
      details: `Before/after or with/without comparison framing detected: ${yesNo(hasBeforeAfterComparison)}.`,
      recommendation:
        hasBeforeAfterComparison
          ? "Comparison framing is present. Keep it outcome-specific and concise."
          : "Add a clear before/after (or with/without) comparison block to make value contrast immediate.",
    },
    "live-product-proof": {
      key: "live-product-proof",
      score: hasLiveProductProof ? 84 : 54,
      details: `Live trend/product-proof signals detected: ${yesNo(hasLiveProductProof)}. View-count cues: ${viewCountSignals}.`,
      recommendation:
        hasLiveProductProof
          ? "Live product proof is visible. Keep examples fresh and clearly labeled."
          : "Add a visible product-proof block (live examples, outputs, trend cards, or real result snapshots) before signup.",
    },
    "pricing-model-clarity": {
      key: "pricing-model-clarity",
      score: hasAbstractPricingModel ? 36 : 82,
      details: `Abstract pricing-unit mentions (credits/tokens/energy): ${energyModelMentions}. Outcome-based usage anchors: ${pricingOutcomeAnchors}.`,
      recommendation:
        hasAbstractPricingModel
          ? "Lead pricing with concrete outcomes/usage first; keep abstract unit systems as secondary detail."
          : "Pricing model language appears concrete and easy to understand.",
    },
    "pricing-plan-positioning": {
      key: "pricing-plan-positioning",
      score: audiencePlanNameCount >= 2 ? 84 : genericPlanNameCount >= 3 ? 52 : 68,
      details: `Generic plan-name signals: ${genericPlanNameCount}. Audience/outcome plan-name signals: ${audiencePlanNameCount}.`,
      recommendation:
        audiencePlanNameCount >= 2
          ? "Plan positioning appears audience-aware. Keep plan names tied to buyer context."
          : "Rename plan labels/headings around audience or outcomes (e.g., solo creator, team, agency) instead of generic tiers.",
    },
    "pricing-comparison-clarity": {
      key: "pricing-comparison-clarity",
      score: pricingComparabilityStrong ? 86 : strongPricingLayout || onPageMatrixDetected || detectedPlanTierCount >= 3 ? 68 : 46,
      status: pricingComparabilityStrong ? "pass" : strongPricingLayout || onPageMatrixDetected || detectedPlanTierCount >= 3 ? "warn" : "fail",
      details: `Layout: ${pricingMatrixKind}. Distinct tiers counted: ${detectedPlanTierCount}. Comparability signals: ${pricingComparabilityHits} of 2+ recommended (${pricingComparabilityStrong ? "sufficient for confident comparability" : pricingComparabilityWeak ? "tiers visible but comparability thin" : "limited pricing layout"}). ${formatList(
        pricingComparabilityNotes,
        "none",
        5,
      )}. Linked pricing pages with comparison/table cues: ${pricingPathSignalCount}. Pricing paths checked: ${formatList(scannedPricingPaths, "none", 3)}.`,
      recommendation: pricingComparabilityStrong
        ? "Pricing tiers look structurally comparable. Keep units, cadence, and feature rows aligned across cards."
        : pricingComparabilityWeak
          ? "Pricing tiers are visible but comparability cues are thin (price/cadence in cards, parallel feature rows, or explicit compare language). Add clearer side-by-side contrast."
          : "Add a side-by-side comparison matrix with clear plan tiers so users can self-qualify quickly.",
    },
    "social-proof": {
      key: "social-proof",
      score: trustSignalsCount >= 2 ? 84 : trustSignalsCount === 1 ? 58 : 24,
      details: `Trust signal clusters detected: ${trustSignalsCount}. Customer-count cues: ${formatList(
        customerProofMatches,
        "none",
        4,
      )}. Named testimonial blocks: ${namedTestimonialBlockCount}. Logo bars detected: ${logoBarCount}. Stat-block cues: ${formatList(
        statBlockMatches,
        "none",
        5,
      )}.`,
      recommendation:
        trustSignalsCount >= 2
          ? "Keep visible testimonial/review credibility cues and customer-count proof in key decision sections."
          : "Add visible testimonial credibility cues and customer-count proof near primary CTAs.",
    },
    "testimonial-outcome-quality": {
      key: "testimonial-outcome-quality",
      score: testimonialOutcomeSignalCount >= 2 ? 84 : testimonialOutcomeSignalCount === 1 ? 62 : 38,
      details: `Quantified outcome cues inside testimonial/case-study sections: ${testimonialOutcomeSignalCount}.`,
      recommendation:
        testimonialOutcomeSignalCount >= 2
          ? "Testimonial outcomes are specific. Keep names, roles, and measurable results visible."
          : "Upgrade testimonials with specific outcomes, named people, and role/company context.",
    },
    "testimonial-third-party-verification": {
      key: "testimonial-third-party-verification",
      score: hasThirdPartyReviewBadge || testimonialExternalReviewLinks > 0 ? 82 : 44,
      details: `Third-party review badge cues: ${yesNo(hasThirdPartyReviewBadge)}. External review/profile links: ${testimonialExternalReviewLinks}.`,
      recommendation:
        hasThirdPartyReviewBadge || testimonialExternalReviewLinks > 0
          ? "External verification signals are present. Keep at least one independent review source visible."
          : "Add independent verification near testimonials (review-platform badges, ratings, or external profile links).",
    },
    "offer-communication": {
      key: "offer-communication",
      score: /features|benefits|compare|faq|how it works/i.test(bodyText) ? 80 : 56,
      details: "Offer communication signals checked for feature context, comparison content, and objection handling.",
      recommendation:
        "Pair feature claims with clear user outcomes and answer common objections near decision points.",
    },
    "technical-health": {
      key: "technical-health",
      score: hasSchema && hasOgTitle && hasTwitterCard ? 82 : hasOgTitle ? 58 : 32,
      details: `Schema present: ${yesNo(hasSchema)} (types: ${formatList(schemaTypeSamples, "none", 6)}). OG tags present: ${yesNo(
        hasOgTitle,
      )} (og:title="${displayValue(ogTitleValue)}"). Twitter card present: ${yesNo(hasTwitterCard)} (twitter:card="${displayValue(
        twitterCardValue,
      )}").`,
      recommendation:
        "Implement full metadata coverage (OG, Twitter) and structured data to support discoverability and trust.",
    },
    "support-objections": {
      key: "support-objections",
      score: hasSupportInHeader ? 86 : 52,
      status: hasSupportInHeader ? "pass" : "warn",
      details: `Support or contact link in header/banner (deterministic): ${yesNo(hasSupportInHeader)}. Header samples: ${formatList(
        headerSupportSamples,
        "none",
        4,
      )}. (Body-wide keyword matches are shown for context only: ${formatList(supportCueMatches, "none", 4)}.)`,
      recommendation: hasSupportInHeader
        ? "Support/contact entry points are visible from the top of the page."
        : "Add a visible Contact, Support, Help, or Chat link in the header or top banner so buyers can resolve objections without hunting the footer.",
    },
    "faq-depth": {
      key: "faq-depth",
      score:
        faqQuestionCount >= 4 || schemaFaqCount >= 4
          ? 88
          : faqQuestionCount >= 1 || schemaFaqCount >= 1
            ? 80
            : hasFaqSectionHeading
              ? 78
              : 40,
      status: faqDepthStatus,
      details: `Visible FAQ question count: ${faqQuestionCount}. Schema FAQ items: ${schemaFaqCount}. FAQ section heading detected: ${yesNo(hasFaqSectionHeading)}. Region headings: ${formatList(
        faqRegionHeadingSamples,
        "none",
        3,
      )}. Question samples: ${formatList(faqHeadingSamples, "none", 5)}.${hasFaqSectionHeading && faqQuestionCount === 0 && schemaFaqCount === 0 ? " Note: labeled FAQ section present; accordion markup may limit automated question extraction." : ""}`,
      recommendation:
        faqQuestionCount >= 4 || schemaFaqCount >= 4
          ? "FAQ depth is strong. Keep adding high-anxiety objections (billing, fit, security, cancellation)."
          : hasFaqSectionHeading || faqQuestionCount > 0 || schemaFaqCount > 0
            ? "FAQ content is present. Ensure questions remain readable to crawlers and assistive tech (visible text, summary elements, or structured FAQPage data)."
            : "Add a visible FAQ that answers purchase objections (billing, cancellation, fit, security).",
    },
    "analytics-tracking": {
      key: "analytics-tracking",
      score: hasAnalytics ? 84 : 18,
      details: `Tracking scripts/signals detected (GA/GTM/pixel/recording): ${yesNo(hasAnalytics)}. Matched signals: ${formatList(
        analyticsSignalMatches,
        "none",
        6,
      )}.`,
      recommendation:
        hasAnalytics
          ? "Keep conversion events instrumented (view, CTA click, checkout start, purchase) and monitor regularly."
          : "Install analytics and conversion event tracking before scaling CRO tests.",
    },
    "footer-cta-clarity": {
      key: "footer-cta-clarity",
      score: footerCtaTexts.length === 0 ? 42 : footerHasContextLine ? 84 : 66,
      status: footerCtaTexts.length === 0 ? "fail" : footerHasContextLine ? "pass" : "warn",
      details: `Footer-zone CTA count (footer plus last page sections / pre-footer bands): ${footerCtaTexts.length}. Risk-reversal (hero + footer zone, or inside CTA labels): ${yesNo(
        footerHasContextLine,
      )}. Matched reassurance phrases: ${formatList(combinedRiskMatches, "none", 5)}. Footer-zone CTA samples: ${formatList(
        footerCtaTexts,
        "none",
        4,
      )}.`,
      recommendation:
        footerCtaTexts.length === 0
          ? "Add at least one legitimate conversion CTA in the footer or pre-footer band."
          : footerHasContextLine
          ? "Footer CTA context is clear. Keep friction-reducing microcopy close to signup action."
          : "Add short risk-reversal microcopy near footer/pre-footer CTAs (no card, trial terms, cancel anytime).",
    },
    "security-compliance-badge": {
      key: "security-compliance-badge",
      score: hasSecurityComplianceBadge ? 84 : 52,
      details: `Footer security/compliance badge cues detected: ${yesNo(hasSecurityComplianceBadge)}.`,
      recommendation:
        hasSecurityComplianceBadge
          ? "Security/compliance trust cues are present. Keep them visible in late-stage decision zones."
          : "Add visible security/compliance trust badges (SOC/ISO equivalent) near final conversion areas.",
    },
    "founder-credibility-story": {
      key: "founder-credibility-story",
      score: storyLength >= 260 && storyCredibilitySignals >= 3 ? 82 : storyLength >= 120 ? 60 : 40,
      details: `Founder/story section text length: ${storyLength}. Credibility cues detected: ${storyCredibilitySignals}.`,
      recommendation:
        storyLength >= 120
          ? "Founder/story section exists. Strengthen it with concrete background, timeline, and why-now credibility."
          : "Expand founder/story section beyond generic copy and include concrete credibility details.",
    },
    "affiliate-program-leverage": {
      key: "affiliate-program-leverage",
      score: !hasAffiliateSignal ? 70 : affiliateInFooterOnly ? 48 : 80,
      details: `Affiliate signal detected: ${yesNo(hasAffiliateSignal)}. Affiliate mentions appear mostly footer-only: ${yesNo(
        affiliateInFooterOnly,
      )}.`,
      recommendation:
        !hasAffiliateSignal
          ? "No affiliate signal detected. This is optional unless partner/community growth is a core channel."
          : affiliateInFooterOnly
            ? "Surface affiliate/community proof earlier than footer to improve trust and advocacy signals."
            : "Affiliate/community signals are surfaced beyond the footer.",
    },
  };

  const checksPayload = CRO_AUDIT_CHECKLIST.map((item) => {
    const check = checksByKey[item.key];
    const checkScore = check?.score ?? 50;
    const computedStatus = check?.status ?? statusFromCheckScore(checkScore);
    const hasStrongNegativeEvidence = (check?.negativeSignals ?? 1) >= 2;
    const status =
      item.priority === "critical" && computedStatus === "fail" && !hasStrongNegativeEvidence
        ? "warn"
        : computedStatus;
    const rawRecommendation = check?.recommendation ?? "Review this area and apply conversion-focused improvements.";
    return {
      key: item.key,
      title: item.title,
      priority: item.priority,
      status,
      details: check?.details ?? item.description,
      recommendation: enforceRecommendationTone(rawRecommendation, status),
    };
  });
  const failPenaltyByPriority: Record<string, number> = {
    critical: 20,
    high: 10,
    medium: 5,
    low: 2,
  };
  const deductions: CroScoreDeduction[] = [];
  checksPayload.forEach((check) => {
    if (check.status === "pass") return;
    const basePenalty = failPenaltyByPriority[check.priority] ?? 2;
    const penalty = check.status === "warn" ? basePenalty / 2 : basePenalty;
    deductions.push({
      key: check.key,
      title: check.title,
      priority: check.priority,
      status: check.status,
      penalty,
    });
  });
  const totalPenalty = deductions.reduce((sum, entry) => sum + entry.penalty, 0);
  const score = clamp(Math.round(100 - totalPenalty), 0, 100);
  const scoreBreakdown: CroScoreBreakdown = {
    formula:
      "100 - Σ(deductions), where FAIL penalties = critical:20/high:10/medium:5/low:2 and WARN = 50% of FAIL penalty",
    totalPenalty,
    deductions,
  };

  return { score, checksPayload, scoreBreakdown };
}

export async function runAuditJob(auditId: string) {
  await prisma.audit.update({
    where: { id: auditId },
    data: { status: AuditStatus.RUNNING },
  });

  try {
    const audit = await prisma.audit.findUniqueOrThrow({
      where: { id: auditId },
    });
    const pageProbe = await fetchWithRedirectTrace(audit.targetUrl, { includeBody: true });
    if (!pageProbe.finalStatus || !pageProbe.html || pageProbe.finalStatus >= 400) {
      throw new Error(`Unable to fetch page (${pageProbe.finalStatus ?? "unknown"})`);
    }
    const html = pageProbe.html;
    if (isCroAuditKeyword(audit.targetKeyword)) {
      const $ = load(html);
      const bodyText = $("body").text().replace(/\s+/g, " ").trim();
      const crawledUrl = normalizeUrl(pageProbe.finalUrl);
      const reportUrl = normalizeUrl(pageProbe.finalUrl);
      if (crawledUrl !== reportUrl) {
        console.error("CRO URL mismatch", { auditId, crawledUrl, reportUrl });
        throw new Error("CRO report URL mismatch: crawled URL diverged from report URL");
      }
      const { score, checksPayload, scoreBreakdown } = await buildCroChecks($, bodyText, audit.targetUrl);
      const reportMarkdown = formatCroReport(
        reportUrl,
        score,
        checksPayload.map((c) => ({
          title: c.title,
          priority: c.priority,
          status: c.status,
          details: c.details ?? "",
          recommendation: c.recommendation ?? "",
        })),
        scoreBreakdown,
      );

      await prisma.$transaction([
        prisma.auditCheck.deleteMany({ where: { auditId } }),
        prisma.auditCheck.createMany({
          data: checksPayload.map((check) => ({
            auditId,
            key: check.key,
            title: check.title,
            status: check.status,
            priority: check.priority,
            details: check.details,
            recommendation: check.recommendation,
          })),
        }),
        prisma.audit.update({
          where: { id: auditId },
          data: {
            status: AuditStatus.COMPLETED,
            score,
            completedAt: new Date(),
            reportMarkdown,
            summary:
              score >= 85
                ? "Strong CRO baseline with selective optimization opportunities."
                : score >= 65
                  ? "CRO performance is mixed. Address high-priority friction first."
                  : "Critical CRO issues detected. Prioritize conversion blockers immediately.",
          },
        }),
      ]);
      return;
    }
    const $ = load(html);
    const keywordCandidates = parseKeywordCandidates(audit.targetKeyword);
    const activeKeywords = keywordCandidates.length > 0 ? keywordCandidates : [audit.targetKeyword.toLowerCase().trim()];
    const displayKeywordList = formatKeywordCandidatesAsQuotedList(activeKeywords);
    const livePageUrl = pageProbe.finalUrl;
    const origin = new URL(livePageUrl).origin;

    const title = $("head > title").first().text().trim() || $("title").first().text().trim();
    const description = $('meta[name="description"]').attr("content") ?? "";
    const metaRobots = parseMetaRobots($);
    const indexabilitySource = `${metaRobots} ${pageProbe.xRobotsTag}`.trim();
    const hasNoindex = hasNoindexDirective(indexabilitySource);
    const hasNofollow = /\bnofollow\b/i.test(indexabilitySource);
    const canonical = $('link[rel="canonical"]').attr("href") ?? "";
    const canonicalUrl = safeUrl(canonical, audit.targetUrl);
    const liveUrlNormalized = normalizeUrl(livePageUrl);
    const requestedUrlNormalized = normalizeUrl(audit.targetUrl);
    const canonicalNormalized = canonicalUrl ? normalizeUrl(canonicalUrl.toString()) : null;
    const canonicalIsSelfReferencing = Boolean(canonicalUrl && canonicalNormalized === liveUrlNormalized);
    const canonicalProbe = canonicalUrl
      ? await fetchWithRedirectTrace(canonicalUrl.toString(), { includeBody: true })
      : null;
    const canonicalTargetStatusOk = canonicalProbe
      ? Boolean(canonicalProbe.finalStatus && canonicalProbe.finalStatus >= 200 && canonicalProbe.finalStatus < 300)
      : false;
    const canonicalTargetMetaRobots =
      canonicalProbe?.html ? parseTitleDescription(canonicalProbe.html).metaRobots : "";
    const canonicalTargetNoindex = canonicalProbe
      ? hasNoindexDirective(`${canonicalProbe.xRobotsTag} ${canonicalTargetMetaRobots}`)
      : false;
    const titleHasExactKeywords = textContainsAllExactKeywords(title, activeKeywords);
    const metaHasKeyword = textContainsAllExactKeywords(description, activeKeywords);
    const h1Count = $("h1").length;
    const h1Text = $("h1").first().text().trim();
    const h1ContainsExactKeywords = textContainsAllExactKeywords(h1Text, activeKeywords);
    const h2Count = $("h2").length;
    const h2Nodes = $("h2").toArray();
    const h2WithAllExactPhrasesCount = h2Nodes.filter((el) =>
      textContainsAllExactKeywords($(el).text(), activeKeywords),
    ).length;
    const hasH2WithAllExactKeywords = h2WithAllExactPhrasesCount > 0;
    const h3Count = $("h3").length;
    const footerH2Count = $("footer h2").length;
    const structuralHeading = firstStructuralHeadingTag($);
    const firstHeadingTag = structuralHeading.tag;
    const firstHeadingIsH1 = structuralHeading.found && firstHeadingTag === "h1";
    const exactKeywordInMetaCount = countExactKeywordMatches(description, activeKeywords);
    const headingHierarchyIssues: string[] = [];
    if (h1Count !== 1) headingHierarchyIssues.push(`expected exactly one H1 but found ${h1Count}`);
    if (structuralHeading.found && !firstHeadingIsH1) {
      headingHierarchyIssues.push(
        `first heading in primary content is ${firstHeadingTag || "none"} instead of H1 (nav/mega-menu excluded)`,
      );
    }
    if (h2Count === 0) headingHierarchyIssues.push("no H2 section headings were found");
    const images = $("img").toArray();
    const missingAltAttribute = images.filter((img) => $(img).attr("alt") === undefined).length;
    const decorativeAltCount = images.filter((img) => ($(img).attr("alt") ?? "") === "").length;
    const initialViewportImageWindow = 3;
    const likelyAboveFoldImages = images.filter((img, index) => {
      if (index < initialViewportImageWindow) return true;
      const wrappedInPriorityContainer = $(img).closest("header, [role='banner'], main section:first-of-type").length > 0;
      return wrappedInPriorityContainer;
    });
    const aboveFoldImageSrcSet = new Set(
      likelyAboveFoldImages
        .map((img) => $(img).attr("src") ?? "")
        .filter((src) => Boolean(src)),
    );
    const nonLazyBelowFoldImages = images.filter((img, index) => {
      const loading = ($(img).attr("loading") ?? "").toLowerCase();
      const src = ($(img).attr("src") ?? "").trim();
      const isLikelyAboveFold = index < initialViewportImageWindow || (src && aboveFoldImageSrcSet.has(src));
      return loading !== "lazy" && !isLikelyAboveFold;
    }).length;
    const preloadImageCount = $('link[rel="preload"][as="image"]').length;
    const imageWithGenericAlt = images.filter((img) => {
      const alt = ($(img).attr("alt") ?? "").trim().toLowerCase();
      return ["image", "img", "icon", "mockup", "photo", "screenshot"].includes(alt);
    }).length;

    const scriptTagsWithSrc = $("script[src]").toArray();
    const scriptTagsBySrc = new Map<string, (typeof scriptTagsWithSrc)[number]>();
    scriptTagsWithSrc.forEach((tag) => {
      const rawSrc = ($(tag).attr("src") ?? "").trim();
      const resolvedSrc = safeUrl(rawSrc, livePageUrl)?.toString() ?? rawSrc;
      if (!resolvedSrc || scriptTagsBySrc.has(resolvedSrc)) return;
      scriptTagsBySrc.set(resolvedSrc, tag);
    });
    const dedupedScriptTagsWithSrc = [...scriptTagsBySrc.values()];
    const scriptSrcUrls = [...scriptTagsBySrc.keys()].filter(Boolean);
    const sameOriginScriptUrls = [...new Set(
      scriptSrcUrls.filter((scriptUrl) => safeUrl(scriptUrl, livePageUrl)?.origin === origin),
    )];
    const stylesheetUrls = [...new Set(
      $('link[rel="stylesheet"][href]')
        .toArray()
        .map((tag) => $(tag).attr("href") ?? "")
        .map((href) => safeUrl(href, livePageUrl)?.toString())
        .filter((url): url is string => Boolean(url))
        .filter((resolved) => safeUrl(resolved, livePageUrl)?.origin === origin),
    )];
    const renderBlockingScripts = dedupedScriptTagsWithSrc.filter((tag) => {
      const isInHead = $(tag).parents("head").length > 0;
      const hasAsync = $(tag).attr("async") !== undefined;
      const hasDefer = $(tag).attr("defer") !== undefined;
      const hasNoModule = $(tag).attr("nomodule") !== undefined;
      const typeValue = ($(tag).attr("type") ?? "").toLowerCase();
      const isModule = typeValue === "module";
      const src = ($(tag).attr("src") ?? "").toLowerCase();
      const isNoModulePolyfill = hasNoModule && /polyfills?[-._]/i.test(src);
      return isInHead && !hasAsync && !hasDefer && !isModule && !isNoModulePolyfill;
    });
    const renderBlockingScriptUrls = renderBlockingScripts
      .map((tag) => $(tag).attr("src") ?? "")
      .map((src) => safeUrl(src, livePageUrl)?.toString() ?? src)
      .filter(Boolean);
    const preloadStyleCount = $('link[rel="preload"][as="style"]').length;
    const nonPreloadedStylesheetCount = Math.max(stylesheetUrls.length - preloadStyleCount, 0);

    const coreAssetCandidates = [...new Set([...sameOriginScriptUrls, ...stylesheetUrls])].slice(0, 12);
    const coreAssetHeaderProbes = await Promise.all(coreAssetCandidates.map((url) => fetchAssetHeaders(url)));
    const successfulCoreAssetProbes = coreAssetHeaderProbes.filter(
      (probe) => Boolean(probe.status && probe.status >= 200 && probe.status < 400),
    );
    const weakCacheAssets = successfulCoreAssetProbes.filter(
      (probe) => !hasStrongCacheControl(probe.cacheControl),
    );
    const uncompressedAssets = successfulCoreAssetProbes.filter(
      (probe) =>
        isLikelyCompressibleAsset(probe.url, probe.contentType) && !probe.contentEncoding.trim(),
    );

    const anchorTags = $("a[href]").toArray();
    const internalAnchors = anchorTags.filter((a) => {
      const href = $(a).attr("href") ?? "";
      return href.startsWith("/") || href.startsWith(origin);
    });
    const internalLinks = internalAnchors.length;
    const nonFragmentInternalLinks = internalAnchors.filter((a) => {
      const href = $(a).attr("href") ?? "";
      return !href.startsWith("#") && href !== "/" && href !== `${origin}/`;
    });

    const schemaScripts = $('script[type="application/ld+json"]').toArray();
    const parsedSchemaTypes: string[] = [];
    const topLevelSchemaTypes: string[] = [];
    const invalidSchemaIndexes: number[] = [];
    const normalizedJsonLdBlocks: string[] = [];
    schemaScripts.forEach((script, index) => {
      try {
        const jsonText = ($(script).text() ?? "").trim();
        const parsed = JSON.parse(jsonText) as unknown;
        parsedSchemaTypes.push(...collectJsonLdTypes(parsed));
        topLevelSchemaTypes.push(...collectTopLevelJsonLdTypes(parsed));
        normalizedJsonLdBlocks.push(JSON.stringify(parsed));
      } catch {
        invalidSchemaIndexes.push(index + 1);
      }
    });
    const uniqueJsonLdBlocks = new Set(normalizedJsonLdBlocks);
    const duplicateJsonLdBlockCount = Math.max(normalizedJsonLdBlocks.length - uniqueJsonLdBlocks.size, 0);
    const validSchemaCount = schemaScripts.length - invalidSchemaIndexes.length;
    const hasFaqSchema = parsedSchemaTypes.some((type) => /faqpage/i.test(type));
    const hasTopLevelOrganizationSchema = topLevelSchemaTypes.some((type) => /organization/i.test(type));
    const hasTopLevelWebSiteSchema = topLevelSchemaTypes.some((type) => /website/i.test(type));

    const hreflangTags = $('link[rel="alternate"][hreflang]').toArray();
    const hreflangEntries = hreflangTags
      .map((tag) => {
        const lang = ($(tag).attr("hreflang") ?? "").trim().toLowerCase();
        const href = ($(tag).attr("href") ?? "").trim();
        const resolved = safeUrl(href, audit.targetUrl)?.toString() ?? href;
        return lang ? `${lang}: ${resolved || "missing-href"}` : "";
      })
      .filter(Boolean);
    const hasXDefault = hreflangTags.some((tag) => ($(tag).attr("hreflang") ?? "").toLowerCase() === "x-default");
    const xDefaultTag = hreflangTags.find((tag) => ($(tag).attr("hreflang") ?? "").toLowerCase() === "x-default");
    const xDefaultHrefRaw = xDefaultTag ? $(xDefaultTag).attr("href") ?? "" : "";
    const xDefaultHref = safeUrl(xDefaultHrefRaw, audit.targetUrl);

    const robotsText = await fetchText(`${origin}/robots.txt`);
    const robotsLower = robotsText?.toLowerCase() ?? "";
    const robotsDeclaresSitemap = robotsLower.includes("sitemap:");
    const robotsAllowsGoogle = !/user-agent:\s*googlebot[\s\S]*?disallow:\s*\/\s*$/im.test(robotsLower);
    const robotsSitemapUrls = parseRobotsSitemapUrls(robotsText, origin);

    const primarySitemapUrl = `${origin}/sitemap.xml`;
    const rootSitemapCandidates = [...new Set([primarySitemapUrl, ...robotsSitemapUrls])];
    const rootSitemapTexts = await Promise.all(
      rootSitemapCandidates.map(async (sitemapUrl) => ({
        sitemapUrl,
        text: await fetchText(sitemapUrl),
      })),
    );
    const reachableRootSitemaps = rootSitemapTexts.filter((entry) => Boolean(entry.text));
    const reachableRootSitemapUrls = reachableRootSitemaps.map((entry) => entry.sitemapUrl);

    const sitemapWalk = await collectSitemapPageUrls(rootSitemapCandidates, origin);
    const sitemapLocs = sitemapWalk.pageUrls;
    const sitemapDocsFetched = sitemapWalk.docsFetched;
    const sitemapStoppedEarly = sitemapWalk.stoppedEarly;

    const sitemapSampleForCrawl = [...new Set([`${origin}/`, ...sitemapLocs])].slice(0, 30);
    const hasLocaleVariantsInSitemap = detectLocaleVariantsInUrls(sitemapLocs, origin);

    const submittedUrl = safeUrl(audit.targetUrl, audit.targetUrl);
    const submittedComparable = submittedUrl ? normalizePageUrlForComparison(submittedUrl) : null;
    const sitemapComparablePages = new Set(
      sitemapLocs
        .map((loc) => safeUrl(loc, origin))
        .filter((url): url is URL => Boolean(url))
        .map((url) => normalizePageUrlForComparison(url)),
    );
    const submittedPageInSitemap = submittedComparable ? sitemapComparablePages.has(submittedComparable) : false;

    const sitemapHasHome = sitemapComparablePages.has(normalizeUrl(`${origin}/`));

    const allInternalLinkCandidates = [...new Set(
      nonFragmentInternalLinks
        .map((a) => $(a).attr("href") ?? "")
        .map((href) => safeUrl(href, livePageUrl)?.toString())
        .filter((href): href is string => Boolean(href)),
    )];
    const internalLinkProbeLimit = 100;
    const internalLinkCandidates = allInternalLinkCandidates.slice(0, internalLinkProbeLimit);
    const internalLinksSampled = internalLinkCandidates.length < allInternalLinkCandidates.length;
    const internalLinkProbes = await Promise.all(
      internalLinkCandidates.map(async (url) => ({
        url,
        probe: await fetchWithRedirectTrace(url, { includeBody: true }),
      })),
    );
    const brokenInternalLinks = internalLinkProbes.filter(
      ({ probe }) => (!probe.finalStatus || probe.finalStatus >= 400) && !probe.challengeDetected,
    );
    const excessiveRedirectInternalLinks = internalLinkProbes.filter(({ probe }) => probe.hops >= 3);

    const metadataPageProbes = await Promise.all(
      sitemapSampleForCrawl.map(async (url) => ({
        url,
        probe: await fetchWithRedirectTrace(url, { includeBody: true }),
      })),
    );
    const crawledMetadataPages = metadataPageProbes.filter(
      ({ probe }) => Boolean(probe.html && probe.finalStatus && probe.finalStatus < 400),
    );
    const duplicateTitleMap = new Map<string, string[]>();
    const duplicateDescriptionMap = new Map<string, string[]>();
    crawledMetadataPages.forEach(({ probe }) => {
      if (!probe.html) return;
      const parsed = parseTitleDescription(probe.html);
      const normalizedTitle = normalizeForDuplicate(parsed.title);
      const normalizedDescription = normalizeForDuplicate(parsed.description);
      if (normalizedTitle) {
        duplicateTitleMap.set(normalizedTitle, [...(duplicateTitleMap.get(normalizedTitle) ?? []), probe.finalUrl]);
      }
      if (normalizedDescription) {
        duplicateDescriptionMap.set(normalizedDescription, [
          ...(duplicateDescriptionMap.get(normalizedDescription) ?? []),
          probe.finalUrl,
        ]);
      }
    });
    const duplicateTitles = [...duplicateTitleMap.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([value, urls]) => ({ value, urls }));
    const duplicateDescriptions = [...duplicateDescriptionMap.entries()]
      .filter(([, urls]) => urls.length > 1)
      .map(([value, urls]) => ({ value, urls }));

    const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
    const ogDescription = $('meta[property="og:description"]').attr("content") ?? "";
    const ogImage = $('meta[property="og:image"]').attr("content") ?? "";
    const twitterCard = $('meta[name="twitter:card"]').attr("content") ?? "";
    const twitterTitle = $('meta[name="twitter:title"]').attr("content") ?? "";
    const twitterDescription = $('meta[name="twitter:description"]').attr("content") ?? "";
    const twitterImage = $('meta[name="twitter:image"]').attr("content") ?? "";

    const checksByKey: Record<string, CheckResult> = {
      "title-tag": {
        key: "title-tag",
        score:
          title.length >= 50 &&
          title.length <= 60 &&
          titleHasExactKeywords
            ? 92
            : title.length >= 20 && title.length <= 72 && titleHasExactKeywords
              ? 84
              : title.length >= 20 && title.length <= 72 && !titleHasExactKeywords
                ? 35
                : 42,
        details: `Current title: "${displayValue(title)}" (${title.length} chars).\nTarget keyword(s): ${displayKeywordList}\nExact match (every target phrase present as a substring, normalized): ${yesNo(titleHasExactKeywords)}.`,
        recommendation: titleHasExactKeywords
          ? "Title includes all target phrases; keep length near 50–60 characters where possible."
          : "Include every user-entered keyword phrase in the title (exact wording after normalization). This check fails if any phrase is missing.",
      },
      "meta-description": {
        key: "meta-description",
        score:
          description.length >= 120 &&
          description.length <= 160 &&
          metaHasKeyword &&
          exactKeywordInMetaCount <= 1
            ? 90
            : description.length >= 120 &&
                description.length <= 200 &&
                metaHasKeyword &&
                exactKeywordInMetaCount <= 1
              ? 72
            : description.length > 0
              ? 58
              : 25,
        details: `Meta description: "${displayValue(description)}".\nLength: ${description.length} characters (Google often truncates around ~155–160 on desktop; shorter on mobile).\nTarget keyword(s): ${displayKeywordList}\nExact match (all phrases in description, normalized): ${yesNo(metaHasKeyword)}. Raw exact-phrase hit count: ${exactKeywordInMetaCount}.`,
        recommendation:
          !metaHasKeyword
            ? "Include the target keyword once in meta description and keep it natural."
            : description.length > 160
            ? "Shorten to ~150–160 characters and front-load the value proposition so the visible snippet is intentional."
            : description.length < 120
              ? "Expand description to include value and keyword intent while staying within a SERP-friendly length."
              : "Keep this meta description format and test copy variants.",
      },
      "h1-count": {
        key: "h1-count",
        score:
          h1Count === 1 && h1ContainsExactKeywords
            ? 95
            : h1Count === 1
              ? 38
              : h1Count === 0
                ? 35
                : 50,
        details: `Detected ${h1Count} H1 tags.\nCurrent H1: "${displayValue(h1Text)}".\nTarget keyword(s): ${displayKeywordList}\nExact match (all phrases in H1, normalized): ${yesNo(h1ContainsExactKeywords)}.`,
        recommendation:
          h1Count === 1 && h1ContainsExactKeywords
            ? "Maintain one clear H1 that includes all target phrases."
            : "Use exactly one H1 and include every user-entered keyword phrase in that H1 (exact substring match after normalization).",
      },
      "h2-keyword": {
        key: "h2-keyword",
        score: hasH2WithAllExactKeywords ? 88 : h2Count > 0 ? 40 : 35,
        details: `H2 headings found: ${h2Count}.\nTarget keyword(s): ${displayKeywordList}\nH2 headings that contain all target phrases (exact, normalized): ${h2WithAllExactPhrasesCount}.`,
        recommendation: hasH2WithAllExactKeywords
          ? "At least one H2 includes every target phrase; keep section headings aligned with search intent."
          : "Add at least one H2 that contains every user-entered keyword phrase (same exact-match rule as title/H1).",
      },
      "heading-hierarchy": {
        key: "heading-hierarchy",
        score:
          h1Count === 1 &&
          (!structuralHeading.found || firstHeadingIsH1) &&
          h2Count > 0 &&
          (h3Count === 0 || h2Count >= Math.floor(h3Count / 2))
            ? 88
            : 52,
        details: `First heading in primary content (main or outside nav/footer): ${firstHeadingTag || "none"}${structuralHeading.found ? "" : " (none detected outside chrome)"}. Heading counts: H1=${h1Count}, H2=${h2Count}, H3=${h3Count}, footer column headings as H2=${footerH2Count} (common and not scored as an error). Issues: ${
          headingHierarchyIssues.length > 0 ? headingHierarchyIssues.join("; ") : "none"
        }.`,
        recommendation:
          "Use one H1 for the primary topic inside main content, then structure sections with clear H2/H3 hierarchy. Navigation markup before the hero is ignored.",
      },
      "structured-data": {
        key: "structured-data",
        score:
          schemaScripts.length === 0
            ? 45
            : validSchemaCount !== schemaScripts.length
              ? 30
              : duplicateJsonLdBlockCount > 0
                ? 70
                : 90,
        details: `JSON-LD blocks found: ${schemaScripts.length}. Valid blocks: ${validSchemaCount}. Invalid blocks: ${invalidSchemaIndexes.join(", ") || "none"}. Exact-duplicate JSON-LD blocks: ${duplicateJsonLdBlockCount}.`,
        recommendation:
          validSchemaCount !== schemaScripts.length
            ? "Fix invalid JSON-LD syntax to restore rich result eligibility."
            : duplicateJsonLdBlockCount > 0
              ? "Remove duplicate JSON-LD blocks so each schema entity is declared once."
              : "Structured data is valid; keep JSON-LD aligned with visible content.",
      },
      "schema-coverage": {
        key: "schema-coverage",
        score:
          schemaScripts.length === 0
            ? 60
            : hasTopLevelOrganizationSchema && hasTopLevelWebSiteSchema
              ? hasFaqSchema
                ? 90
                : 86
              : hasTopLevelOrganizationSchema || hasTopLevelWebSiteSchema
                ? 76
                : 64,
        details: `Schema types detected (all nested levels): ${parsedSchemaTypes.join(", ") || "none"}. Top-level schema types (root/@graph only): ${topLevelSchemaTypes.join(", ") || "none"}. FAQPage present: ${yesNo(hasFaqSchema)}. Top-level Organization: ${yesNo(hasTopLevelOrganizationSchema)}. Top-level WebSite: ${yesNo(hasTopLevelWebSiteSchema)}.`,
        recommendation:
          hasTopLevelOrganizationSchema && hasTopLevelWebSiteSchema
            ? "Top-level Organization and WebSite schema are present; keep entities synchronized with the live page."
            : "Consider adding standalone top-level Organization/WebSite JSON-LD where relevant to clarify site-level entities; nested publisher/provider nodes do not satisfy this coverage.",
      },
      canonical: {
        key: "canonical",
        score: canonicalIsSelfReferencing ? 95 : canonical ? 48 : 20,
        details: canonical
          ? `Canonical points to: ${canonical}. Self-referencing canonical: ${yesNo(canonicalIsSelfReferencing)}.`
          : "No canonical tag detected.",
        recommendation:
          canonicalIsSelfReferencing
            ? "Canonical implementation looks strong. Keep it self-referencing on indexable pages."
            : "Add a self-referencing canonical tag that matches the live page URL.",
      },
      "canonical-consistency": {
        key: "canonical-consistency",
        score:
          !canonicalUrl
            ? 20
            : canonicalUrl.origin !== origin
              ? 42
              : !canonicalTargetStatusOk
                ? 35
                : canonicalTargetNoindex
                  ? 30
                  : canonicalNormalized === liveUrlNormalized
                    ? 92
                    : canonicalUrl.pathname === "/"
                      ? 68
                      : 55,
        details: canonicalUrl
          ? `Canonical normalized: ${canonicalNormalized}. Live URL normalized: ${liveUrlNormalized}. Requested URL normalized: ${requestedUrlNormalized}. Canonical target status: ${canonicalProbe?.finalStatus ?? "n/a"}. Canonical target noindex: ${yesNo(canonicalTargetNoindex)}.`
          : "Canonical URL is missing or invalid.",
        recommendation:
          canonicalUrl && canonicalUrl.origin === origin
            ? "Keep canonical host consistent and ensure canonical target resolves as indexable 200 URL."
            : "Set a valid same-domain canonical URL and avoid cross-domain canonicals unless intentional.",
      },
      "indexability-controls": {
        key: "indexability-controls",
        score: hasNoindex ? 20 : hasNofollow ? 55 : 92,
        details: `meta robots="${displayValue(metaRobots)}", x-robots-tag="${displayValue(
          pageProbe.xRobotsTag,
        )}". noindex detected: ${yesNo(hasNoindex)}. nofollow detected: ${yesNo(hasNofollow)}.`,
        recommendation: hasNoindex
          ? "Remove noindex directives from pages intended to rank."
          : hasNofollow
            ? "Review nofollow directives and keep crawl paths open for important pages."
            : "Indexability directives look healthy for ranking pages.",
      },
      "http-status-chain": {
        key: "http-status-chain",
        score:
          !pageProbe.finalStatus
            ? 30
            : pageProbe.finalStatus >= 400
              ? 20
              : pageProbe.hops >= 3
                ? 48
                : pageProbe.usedTemporaryRedirect
                  ? 62
                  : 92,
        details: `Requested URL: ${audit.targetUrl}. Final URL: ${pageProbe.finalUrl}. Final status: ${
          pageProbe.finalStatus ?? "n/a"
        }. Redirect hops: ${pageProbe.hops}. Temporary redirects used: ${yesNo(
          pageProbe.usedTemporaryRedirect,
        )}. Loop detected: ${yesNo(pageProbe.loopDetected)}. Chain: ${formatList(pageProbe.chain, "none", 6)}.`,
        recommendation:
          "Prefer a direct 200 response with minimal hops; reduce long redirect chains and temporary redirects for stable canonical URLs.",
      },
      hreflang: {
        key: "hreflang",
        score: hreflangTags.length === 0 && !hasLocaleVariantsInSitemap ? 80 : hasXDefault ? 85 : 65,
        details: `Hreflang entries: ${formatList(hreflangEntries)}. x-default present: ${yesNo(
          hasXDefault,
        )}. x-default href: ${xDefaultHref?.toString() ?? "missing"}. Locale variants inferred from sitemap URLs: ${yesNo(
          hasLocaleVariantsInSitemap,
        )}.`,
        recommendation:
          hreflangTags.length === 0 && !hasLocaleVariantsInSitemap
            ? "No multi-locale signal detected; treating hreflang as not applicable for this page."
            : "Ensure x-default points to your canonical default page and locale URLs are in sitemap.",
      },
      sitemap: {
        key: "sitemap",
        score:
          reachableRootSitemaps.length > 0
            ? submittedPageInSitemap
              ? 92
              : sitemapStoppedEarly
                ? 70
                : sitemapHasHome
                  ? 72
                  : 48
            : 20,
        details:
          reachableRootSitemaps.length > 0
            ? `Seed sitemap URLs: ${formatList(rootSitemapCandidates)}. Reachable: ${formatList(
                reachableRootSitemapUrls,
              )}. Sitemap documents fetched (indexes expanded into child sitemaps): ${sitemapDocsFetched}. Stopped early (cap ${MAX_SITEMAP_DOC_FETCHES}): ${yesNo(
                sitemapStoppedEarly,
              )}. Page URLs collected after expansion: ${sitemapLocs.length}. Submitted page: ${
                submittedComparable ?? audit.targetUrl
              }. Submitted page found in expanded set: ${yesNo(submittedPageInSitemap)}.`
            : `No reachable sitemap found. Checked: ${formatList(rootSitemapCandidates)}.`,
        recommendation: submittedPageInSitemap
          ? "Sitemap coverage includes this URL (after expanding sitemap indexes)."
          : sitemapStoppedEarly
            ? "Could not confirm URL in sitemap before fetch cap; verify in Search Console or increase sitemap crawl limits."
            : "Ensure the audited URL appears in your published sitemaps (including nested sitemap files).",
      },
      robots: {
        key: "robots",
        score: robotsText && robotsAllowsGoogle ? 88 : robotsText ? 55 : 30,
        details: robotsText
          ? `robots.txt URL: ${origin}/robots.txt. Sitemap line present: ${yesNo(
              robotsDeclaresSitemap,
            )}. Reachable sitemap on host: ${yesNo(reachableRootSitemaps.length > 0)}. Sitemap URLs in robots: ${formatList(
              robotsSitemapUrls,
            )}. Googlebot broadly allowed: ${yesNo(robotsAllowsGoogle)}. Note: declaring sitemaps in robots.txt is optional if you submit them in Search Console.`
          : `robots.txt not detected at ${origin}/robots.txt.`,
        recommendation:
          "Keep crawl directives intentional. Add a sitemap line only if you want a universal hint beyond Search Console submissions.",
      },
      "social-tags": {
        key: "social-tags",
        score:
          ogTitle.length >= 30 &&
          ogTitle.length <= 65 &&
          ogDescription.length >= 70 &&
          ogDescription.length <= 220 &&
          ogImage.length > 0
            ? 85
            : ogTitle.length > 0 && ogDescription.length > 0 && ogImage.length > 0
              ? 70
            : 55,
        details: `og:title="${displayValue(ogTitle)}", og:description="${displayValue(
          ogDescription,
        )}", og:image="${displayValue(ogImage)}".`,
        recommendation:
          "Set Open Graph and X card tags for stronger link previews.",
      },
      "twitter-card-coverage": {
        key: "twitter-card-coverage",
        score:
          twitterCard.length > 0 &&
          twitterTitle.length >= 30 &&
          twitterTitle.length <= 70 &&
          twitterDescription.length >= 70 &&
          twitterDescription.length <= 220 &&
          twitterImage.length > 0
            ? 86
            : twitterCard.length > 0 && twitterTitle.length > 0 && twitterDescription.length > 0
              ? 62
              : 45,
        details: `twitter:card="${displayValue(twitterCard)}", twitter:title="${displayValue(
          twitterTitle,
        )}", twitter:description="${displayValue(twitterDescription)}", twitter:image="${displayValue(
          twitterImage,
        )}".`,
        recommendation:
          "Provide complete Twitter card tags (card, title, description, image) for reliable social previews.",
      },
      "alt-text": {
        key: "alt-text",
        score:
          images.length === 0
            ? 80
            : clamp(
                100 - Math.round(((missingAltAttribute + imageWithGenericAlt) / images.length) * 100),
                35,
                98,
              ),
        details: `Images: ${images.length}. Missing alt attribute (invalid): ${missingAltAttribute}. Decorative alt=\"\" (valid): ${decorativeAltCount}. Generic placeholder alt text: ${imageWithGenericAlt}.`,
        recommendation:
          "Ensure every <img> has an alt attribute; use alt=\"\" for decorative images and descriptive text for meaningful ones.",
      },
      "image-performance": {
        key: "image-performance",
        score:
          images.length === 0
            ? 80
            : nonLazyBelowFoldImages === 0 && preloadImageCount <= 3
              ? 90
              : nonLazyBelowFoldImages <= 2 && preloadImageCount <= 3
                ? 76
                : preloadImageCount > 3
                  ? 55
                : 45,
        details: [
          `Total images: ${images.length}.`,
          ...(nonLazyBelowFoldImages > 0
            ? [`Non-lazy images likely below-the-fold: ${nonLazyBelowFoldImages}.`]
            : []),
          ...(preloadImageCount > 3 ? [`Preload image hints: ${preloadImageCount} (recommended <=3).`] : []),
          `Heuristic used for "likely below-the-fold": images after the first ${initialViewportImageWindow} in DOM order, unless inside header/banner/first main section.`,
        ].join(" "),
        recommendation:
          preloadImageCount > 3 && nonLazyBelowFoldImages > 0
            ? "Reduce image preloads to the most critical 1-3 assets and lazy-load likely below-the-fold images while keeping likely above-the-fold/LCP images eager."
            : preloadImageCount > 3
              ? "Reduce image preloads to the most critical 1-3 assets and keep likely above-the-fold/LCP images eagerly loaded."
              : nonLazyBelowFoldImages > 0
                ? "Lazy-load likely below-the-fold images while keeping likely above-the-fold/LCP images eager."
                : "Current image loading/preload strategy looks balanced.",
      },
      "render-blocking-resources": {
        key: "render-blocking-resources",
        score:
          renderBlockingScripts.length === 0
            ? 90
            : renderBlockingScripts.length <= 1
              ? 72
              : renderBlockingScripts.length <= 2
                ? 58
                : 40,
        details:
          stylesheetUrls.length === 0
            ? `Parser-blocking head scripts (no async/defer/module): ${renderBlockingScripts.length} (${formatList(
                renderBlockingScriptUrls,
                "none",
                4,
              )}). Stylesheets linked: 0.`
            : `Parser-blocking head scripts (no async/defer/module): ${renderBlockingScripts.length} (${formatList(
                renderBlockingScriptUrls,
                "none",
                4,
              )}). Stylesheets linked: ${stylesheetUrls.length}. Stylesheets without link preload: ${nonPreloadedStylesheetCount}.`,
        recommendation:
          renderBlockingScripts.length > 0
            ? "Move or defer parser-blocking scripts (async/defer/module) so they do not block HTML parsing."
            : stylesheetUrls.length > 0
              ? "For CSS, consider inlining critical CSS and loading non-critical styles with media tricks or deferred bundles."
              : "No parser-blocking scripts were detected.",
      },
      "asset-caching-compression": {
        key: "asset-caching-compression",
        score:
          successfulCoreAssetProbes.length === 0
            ? 72
            : weakCacheAssets.length === 0 && uncompressedAssets.length === 0
              ? 92
              : weakCacheAssets.length <= 1 && uncompressedAssets.length <= 1
                ? 82
                : weakCacheAssets.length + uncompressedAssets.length <= 3
                  ? 64
                  : 42,
        details: `Core assets checked: ${successfulCoreAssetProbes.length}/${coreAssetCandidates.length}. Strong cache threshold: max-age≥${CACHE_STRONG_THRESHOLD_SEC}s (1 day) or Cache-Control includes "immutable".

Weak cache-control (below threshold or missing max-age):
${weakCacheAssets.length ? formatCacheControlEvidence(weakCacheAssets) : "(none)"}

Uncompressed text assets (${uncompressedAssets.length}): ${formatList(uncompressedAssets.map((asset) => asset.url), "none", 3)}.`,
        recommendation:
          `Prefer long max-age (often ≥31536000 for hashed/versioned filenames) plus compression for text responses.`,
      },
      "internal-linking": {
        key: "internal-linking",
        score: internalLinks >= 5 ? 85 : internalLinks >= 2 ? 65 : 45,
        details: `Internal links detected: ${internalLinks}.`,
        recommendation:
          "Add contextual internal links between key sections and supporting pages.",
      },
      "internal-links-health": {
        key: "internal-links-health",
        score:
          internalLinkCandidates.length === 0
            ? 72
            : brokenInternalLinks.length === 0 && excessiveRedirectInternalLinks.length === 0
              ? 90
              : brokenInternalLinks.length <= 1 && excessiveRedirectInternalLinks.length <= 2
                ? 66
                : 42,
        details: `Internal links checked: ${internalLinkCandidates.length}/${allInternalLinkCandidates.length}${
          internalLinksSampled ? " (sampled)" : " (full set)"
        }. Broken (4xx/5xx): ${
          brokenInternalLinks.length
        } (${formatList(brokenInternalLinks.map((item) => item.url), "none", 3)}). Excessive redirect chains (3+ hops): ${
          excessiveRedirectInternalLinks.length
        } (${formatList(excessiveRedirectInternalLinks.map((item) => item.url), "none", 3)}). Bot-challenge protected links excluded from broken count: ${
          internalLinkProbes.filter(({ probe }) => probe.challengeDetected).length
        }.`,
        recommendation:
          internalLinksSampled
            ? "Fix broken internal links and long redirect chains; this result is sampled, so run a full crawl for exhaustive coverage."
            : "Fix broken internal links and update URLs that pass through long redirect chains.",
      },
      "duplicate-metadata": {
        key: "duplicate-metadata",
        score:
          crawledMetadataPages.length < 5
            ? 60
            : duplicateTitles.length === 0 && duplicateDescriptions.length === 0
              ? 90
              : duplicateTitles.length <= 1 && duplicateDescriptions.length <= 1
                ? 65
                : 42,
        details: `Pages crawled for metadata: ${crawledMetadataPages.length}. Duplicate title groups: ${
          duplicateTitles.length
        } (${formatDuplicateSamples(duplicateTitles)}). Duplicate description groups: ${
          duplicateDescriptions.length
        } (${formatDuplicateSamples(duplicateDescriptions)}).`,
        recommendation:
          "Make title and meta description copy unique for each indexable page in the sampled set.",
      },
    };

    const effectivePriorityByKey: Record<string, "critical" | "high" | "medium" | "low"> = {
      canonical: "critical",
      "title-tag": titleHasExactKeywords ? "high" : "critical",
      "h1-count": h1ContainsExactKeywords ? "high" : "critical",
      "h2-keyword": hasH2WithAllExactKeywords ? "high" : "critical",
      "indexability-controls": hasNoindex ? "critical" : "high",
      "http-status-chain": pageProbe.hops >= 3 || pageProbe.usedTemporaryRedirect ? "high" : "medium",
      "render-blocking-resources": renderBlockingScripts.length >= 3 ? "critical" : "high",
      "asset-caching-compression":
        weakCacheAssets.length + uncompressedAssets.length >= 4 ? "high" : "medium",
    };

    const weighted = AUDIT_CHECKLIST.map((item) => {
      const check = checksByKey[item.key];
      const score = check ? check.score : 50;
      const effectivePriority = effectivePriorityByKey[item.key] ?? item.priority;
      return { item, check, weightedScore: score * PRIORITY_WEIGHT[effectivePriority], effectivePriority };
    });

    const totalWeight = weighted.reduce((acc, entry) => acc + PRIORITY_WEIGHT[entry.effectivePriority], 0);
    const score = clamp(
      totalWeight === 0
        ? 75
        : Math.round(weighted.reduce((acc, entry) => acc + entry.weightedScore, 0) / totalWeight),
      20,
      98,
    );

    const checksPayload = AUDIT_CHECKLIST.map((item) => {
      const check = checksByKey[item.key];
      const checkScore = check?.score ?? 50;
      const effectivePriority = effectivePriorityByKey[item.key] ?? item.priority;
      return {
        auditId,
        key: item.key,
        title: item.title,
        priority: effectivePriority,
        status: statusFromCheckScore(checkScore),
        details: check?.details ?? item.description,
        recommendation: check?.recommendation ?? "Review this area and apply best-practice fixes.",
      };
    });

    const reportMarkdown = formatReport(
      audit.targetUrl,
      audit.targetKeyword,
      score,
      checksPayload.map((c) => ({
        title: c.title,
        priority: c.priority,
        status: c.status,
        details: c.details ?? "",
        recommendation: c.recommendation ?? "",
      })),
    );

    await prisma.$transaction([
      prisma.auditCheck.deleteMany({ where: { auditId } }),
      prisma.auditCheck.createMany({
        data: checksPayload,
      }),
      prisma.audit.update({
        where: { id: auditId },
        data: {
          status: AuditStatus.COMPLETED,
          score,
          completedAt: new Date(),
          reportMarkdown,
          summary:
            score >= 80
              ? "Strong SEO baseline with a few opportunities."
              : score >= 60
                ? "SEO performance is mixed. Address high-priority issues first."
                : "Core SEO issues detected. Prioritize critical fixes first.",
        },
      }),
    ]);
  } catch (error) {
    let message = error instanceof Error ? error.message : "Unknown audit error";
    if (error instanceof Error && /abort|timed out|timeout/i.test(`${error.name} ${message}`)) {
      const ms = process.env.AUDIT_FETCH_TIMEOUT_MS ?? "45000";
      message = `Target fetch timed out or was aborted (limit ${ms}ms per hop). Try again or audit a faster URL.`;
    }
    await prisma.audit.update({
      where: { id: auditId },
      data: {
        status: AuditStatus.FAILED,
        errorMessage: message,
      },
    });
  }
}
