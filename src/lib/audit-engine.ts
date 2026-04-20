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
  matchesAnyKeywordEquivalent,
  parseKeywordCandidates,
} from "@/lib/keyword-match";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Avoid "Unable to start a transaction in the given time" when the pool is busy (many concurrent workers). */
const AUDIT_COMPLETION_TRANSACTION = {
  maxWait: 30_000,
  timeout: 60_000,
} as const;

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
};

type SafeBrowsingResult = {
  configured: boolean;
  error: string | null;
  flagged: boolean;
  threatTypes: string[];
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
  const chain = [url];
  const visited = new Set<string>([url]);
  let current = url;
  let usedTemporaryRedirect = false;

  for (let i = 0; i <= maxRedirects; i += 1) {
    const response = await fetch(current, {
      headers: { "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)" },
      cache: "no-store",
      redirect: "manual",
    });
    const location = response.headers.get("location");
    const isRedirect = redirectStatus(response.status) && Boolean(location);

    if (!isRedirect || !location) {
      return {
        requestedUrl: url,
        finalUrl: current,
        finalStatus: response.status,
        hops: chain.length - 1,
        usedTemporaryRedirect,
        loopDetected: false,
        chain,
        xRobotsTag: response.headers.get("x-robots-tag") ?? "",
        html: includeBody ? await response.text() : null,
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
  };
}

async function fetchText(url: string, timeoutMs = 12_000) {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    return response.text();
  } catch {
    return null;
  }
}

function hasStrongCacheControl(cacheControlHeader: string) {
  const value = cacheControlHeader.toLowerCase();
  if (!value) return false;
  if (value.includes("immutable")) return true;
  const match = value.match(/max-age=(\d+)/i);
  if (!match) return false;
  return Number(match[1]) >= 86400;
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

  const graphTypes = collectJsonLdTypes(node["@graph"]);
  return [...ownTypes, ...graphTypes];
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

function yesNo(value: boolean) {
  return value ? "yes" : "no";
}

function looksLikeFaqQuestionText(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 8 || t.length > 280) return false;
  if (/^(menu|close|open|next|previous|back|show more|see more|expand|collapse)\b/i.test(t)) return false;
  return /\?\s*$/.test(t) || /^(what|how|why|when|where|which|who|can|do|does|did|is|are|will|should|could|would)\b/i.test(t);
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

async function checkSafeBrowsing(targetUrl: string): Promise<SafeBrowsingResult> {
  const apiKey = process.env.GOOGLE_SAFE_BROWSING_API_KEY;
  if (!apiKey) {
    return { configured: false, error: null, flagged: false, threatTypes: [] };
  }

  try {
    const response = await fetch(
      `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client: { clientId: "trafficlift", clientVersion: "1.0.0" },
          threatInfo: {
            threatTypes: [
              "MALWARE",
              "SOCIAL_ENGINEERING",
              "UNWANTED_SOFTWARE",
              "POTENTIALLY_HARMFUL_APPLICATION",
            ],
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url: targetUrl }],
          },
        }),
      },
    );
    if (!response.ok) {
      return {
        configured: true,
        error: `API error (${response.status})`,
        flagged: false,
        threatTypes: [],
      };
    }

    const data = (await response.json()) as { matches?: Array<{ threatType?: string }> };
    const matches = data.matches ?? [];
    const threatTypes = [...new Set(matches.map((m) => m.threatType).filter((v): v is string => Boolean(v)))];
    return {
      configured: true,
      error: null,
      flagged: matches.length > 0,
      threatTypes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { configured: true, error: message, flagged: false, threatTypes: [] };
  }
}

function statusFromCheckScore(checkScore: number): "pass" | "fail" | "warn" {
  if (checkScore >= 80) return "pass";
  if (checkScore >= 60) return "warn";
  return "fail";
}

async function getPageSpeedMetrics(targetUrl: string) {
  if (!process.env.PAGESPEED_API_KEY) {
    return null;
  }

  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", targetUrl);
  endpoint.searchParams.set("strategy", "mobile");
  endpoint.searchParams.set("category", "performance");
  endpoint.searchParams.set("key", process.env.PAGESPEED_API_KEY);

  const response = await fetch(endpoint.toString(), { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    lighthouseResult?: {
      categories?: { performance?: { score?: number } };
      audits?: {
        "largest-contentful-paint"?: { displayValue?: string };
        "cumulative-layout-shift"?: { displayValue?: string };
        "interaction-to-next-paint"?: { displayValue?: string };
      };
    };
  };

  const performance = data.lighthouseResult?.categories?.performance?.score;
  const lcp = data.lighthouseResult?.audits?.["largest-contentful-paint"]?.displayValue;
  const cls = data.lighthouseResult?.audits?.["cumulative-layout-shift"]?.displayValue;
  const inp = data.lighthouseResult?.audits?.["interaction-to-next-paint"]?.displayValue;

  return {
    score: typeof performance === "number" ? Math.round(performance * 100) : null,
    lcp: lcp ?? "n/a",
    cls: cls ?? "n/a",
    inp: inp ?? "n/a",
  };
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
  const byPriority = {
    critical: checks.filter((c) => c.priority === "critical" && c.status !== "pass"),
    high: checks.filter((c) => c.priority === "high" && c.status !== "pass"),
    medium: checks.filter((c) => c.priority === "medium" && c.status !== "pass"),
    low: checks.filter((c) => c.priority === "low" && c.status !== "pass"),
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
  const actionCtaRegex =
    /(get started|get a demo|buy|order|start|sign up|subscribe|shop|audit|checkout|book|trial|start for free|talk to sales|contact sales|speak to sales|talk with sales|get insights|view plans?)/i;
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

      await prisma.$transaction(
        async (tx) => {
          await tx.auditCheck.deleteMany({ where: { auditId } });
          await tx.auditCheck.createMany({
            data: checksPayload.map((check) => ({
              auditId,
              key: check.key,
              title: check.title,
              status: check.status,
              priority: check.priority,
              details: check.details,
              recommendation: check.recommendation,
            })),
          });
          await tx.audit.update({
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
          });
        },
        AUDIT_COMPLETION_TRANSACTION,
      );
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
    const titleHasKeyword = matchesAnyKeywordEquivalent(title, activeKeywords);
    const metaHasKeyword = matchesAnyKeywordEquivalent(description, activeKeywords);
    const h1Count = $("h1").length;
    const h1Text = $("h1").first().text().trim();
    const h1ContainsKeyword = matchesAnyKeywordEquivalent(h1Text, activeKeywords);
    const h2Count = $("h2").length;
    const h2WithKeywordCount = $("h2")
      .toArray()
      .filter((el) => matchesAnyKeywordEquivalent($(el).text(), activeKeywords)).length;
    const h3Count = $("h3").length;
    const footerH2Count = $("footer h2").length;
    const firstHeadingTagRaw = $("h1, h2, h3, h4, h5, h6").first().get(0)?.tagName ?? "";
    const firstHeadingTag = firstHeadingTagRaw.toLowerCase();
    const firstHeadingIsH1 = firstHeadingTag === "h1";
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = bodyText ? bodyText.split(" ").length : 0;
    const keywordCount = countExactKeywordMatches(bodyText, activeKeywords);
    const keywordDensity = wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;
    const exactKeywordInMetaCount = countExactKeywordMatches(description, activeKeywords);
    const headingHierarchyIssues: string[] = [];
    if (h1Count !== 1) headingHierarchyIssues.push(`expected exactly one H1 but found ${h1Count}`);
    if (!firstHeadingIsH1) headingHierarchyIssues.push(`first heading is ${firstHeadingTag || "none"} instead of H1`);
    if (h2Count === 0) headingHierarchyIssues.push("no H2 section headings were found");
    if (footerH2Count > 0) headingHierarchyIssues.push(`${footerH2Count} H2 heading(s) found inside footer`);
    const metaAppearsStuffed = exactKeywordInMetaCount > 1;

    const images = $("img").toArray();
    const missingAlt = images.filter((img) => !($(img).attr("alt") ?? "").trim()).length;
    const nonLazyImages = images.filter((img) => {
      const loading = ($(img).attr("loading") ?? "").toLowerCase();
      return loading !== "lazy";
    }).length;
    const preloadImageCount = $('link[rel="preload"][as="image"]').length;
    const imageWithGenericAlt = images.filter((img) => {
      const alt = ($(img).attr("alt") ?? "").trim().toLowerCase();
      return ["image", "img", "icon", "mockup", "photo", "screenshot"].includes(alt);
    }).length;

    const scriptTagsWithSrc = $("script[src]").toArray();
    const scriptSrcUrls = scriptTagsWithSrc
      .map((tag) => $(tag).attr("src") ?? "")
      .map((src) => safeUrl(src, livePageUrl)?.toString())
      .filter((url): url is string => Boolean(url));
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
    const renderBlockingScripts = scriptTagsWithSrc.filter((tag) => {
      const isInHead = $(tag).parents("head").length > 0;
      const hasAsync = $(tag).attr("async") !== undefined;
      const hasDefer = $(tag).attr("defer") !== undefined;
      const typeValue = ($(tag).attr("type") ?? "").toLowerCase();
      const isModule = typeValue === "module";
      return isInHead && !hasAsync && !hasDefer && !isModule;
    });
    const renderBlockingScriptUrls = renderBlockingScripts
      .map((tag) => $(tag).attr("src") ?? "")
      .map((src) => safeUrl(src, livePageUrl)?.toString() ?? src)
      .filter(Boolean);
    const preloadStyleCount = $('link[rel="preload"][as="style"]').length;
    const nonPreloadedStylesheetCount = Math.max(stylesheetUrls.length - preloadStyleCount, 0);

    const thirdPartyScriptUrls = [...new Set(
      scriptSrcUrls.filter((scriptUrl) => {
        const resolved = safeUrl(scriptUrl, livePageUrl);
        return Boolean(resolved && resolved.origin !== origin);
      }),
    )];
    const thirdPartyScriptDomains = [...new Set(
      thirdPartyScriptUrls
        .map((scriptUrl) => safeUrl(scriptUrl, livePageUrl)?.hostname.toLowerCase() ?? "")
        .filter(Boolean),
    )];

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
    const internalUniquePaths = new Set(
      internalAnchors
        .map((a) => $(a).attr("href") ?? "")
        .map((href) => safeUrl(href, audit.targetUrl))
        .filter((url): url is URL => Boolean(url))
        .map((url) => `${url.origin}${url.pathname}`)
        .filter((url) => url.startsWith(origin)),
    );

    const schemaScripts = $('script[type="application/ld+json"]').toArray();
    const parsedSchemaTypes: string[] = [];
    const invalidSchemaIndexes: number[] = [];
    schemaScripts.forEach((script, index) => {
      try {
        const parsed = JSON.parse($(script).text()) as unknown;
        parsedSchemaTypes.push(...collectJsonLdTypes(parsed));
      } catch {
        invalidSchemaIndexes.push(index + 1);
      }
    });
    const validSchemaCount = schemaScripts.length - invalidSchemaIndexes.length;
    const hasFaqSchema = parsedSchemaTypes.some((type) => /faqpage/i.test(type));
    const hasOrganizationSchema = parsedSchemaTypes.some((type) => /organization/i.test(type));
    const hasWebSiteSchema = parsedSchemaTypes.some((type) => /website/i.test(type));

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
    const aiBotBlocked = /(claudebot|gptbot|bytespider|ccbot|google-extended)/i.test(robotsLower);
    const matchedAiBots = ["claudebot", "gptbot", "bytespider", "ccbot", "google-extended"].filter((bot) =>
      robotsLower.includes(bot),
    );
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

    const nestedSitemapUrls = [...new Set(
      reachableRootSitemaps.flatMap((entry) =>
        parseSitemapLocs(entry.text).filter((loc) => /\.xml($|\?)/i.test(loc)),
      ),
    )].slice(0, 20);

    const nestedSitemapTexts = await Promise.all(
      nestedSitemapUrls.map(async (sitemapUrl) => ({
        sitemapUrl,
        text: await fetchText(sitemapUrl),
      })),
    );

    const sitemapLocs = [
      ...new Set(
        [...reachableRootSitemaps, ...nestedSitemapTexts]
          .flatMap((entry) => parseSitemapLocs(entry.text))
          .filter((loc) => !/\.xml($|\?)/i.test(loc)),
      ),
    ];
    const sampleSitemapLocs = sitemapLocs.slice(0, 5);
    const sitemapSampleForCrawl = [...new Set([`${origin}/`, ...sitemapLocs])].slice(0, 30);

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
    const sitemapBlogArticleCount = [...sitemapComparablePages].filter((page) => /\/(blog|news)\//i.test(page)).length;
    const sitemapLocaleCount = [...sitemapComparablePages].filter((page) => {
      const url = safeUrl(page, origin);
      return url ? /^\/[a-z]{2}(-[a-z]{2})?\/?$/i.test(url.pathname) : false;
    }).length;

    const internalLinkCandidates = [...new Set(
      nonFragmentInternalLinks
        .map((a) => $(a).attr("href") ?? "")
        .map((href) => safeUrl(href, livePageUrl)?.toString())
        .filter((href): href is string => Boolean(href)),
    )].slice(0, 20);
    const internalLinkProbes = await Promise.all(
      internalLinkCandidates.map(async (url) => ({
        url,
        probe: await fetchWithRedirectTrace(url),
      })),
    );
    const brokenInternalLinks = internalLinkProbes.filter(
      ({ probe }) => !probe.finalStatus || probe.finalStatus >= 400,
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

    const safeBrowsing = await checkSafeBrowsing(livePageUrl);

    const ogTitle = $('meta[property="og:title"]').attr("content") ?? "";
    const ogDescription = $('meta[property="og:description"]').attr("content") ?? "";
    const ogImage = $('meta[property="og:image"]').attr("content") ?? "";
    const twitterCard = $('meta[name="twitter:card"]').attr("content") ?? "";
    const twitterTitle = $('meta[name="twitter:title"]').attr("content") ?? "";
    const twitterDescription = $('meta[name="twitter:description"]').attr("content") ?? "";
    const twitterImage = $('meta[name="twitter:image"]').attr("content") ?? "";

    const testimonialNodes = $('blockquote, [class*="testimonial" i], [id*="testimonial" i]').length;
    const hasTestimonials =
      testimonialNodes > 0 || /(testimonial|testimonials|case study|customer stories|trusted by|reviews?)/i.test(bodyText);
    const hasNamedAuthor = /(by\s+[A-Z][a-z]+\s+[A-Z][a-z]+|author)/.test(bodyText);
    const aboutLinkMatches = $("a[href]")
      .toArray()
      .map((a) => $(a).attr("href") ?? "")
      .map((href) => safeUrl(href, livePageUrl))
      .filter((url): url is URL => Boolean(url))
      .filter((url) => url.origin === origin)
      .map((url) => url.pathname.toLowerCase())
      .filter((path) => path === "/about" || path === "/about/" || path === "/about-us" || path === "/about-us/");
    const hasAboutPageLink = aboutLinkMatches.length > 0;
    const aboutPaths = ["/about", "/about-us"] as const;
    const aboutPageTexts = await Promise.all(aboutPaths.map((path) => fetchText(`${origin}${path}`)));
    const reachableAboutPages = aboutPageTexts.filter((content) => Boolean(content)).length;
    const combinedAboutText = aboutPageTexts.filter((content): content is string => Boolean(content)).join(" ");
    const hasAboutPageContent = reachableAboutPages > 0 && combinedAboutText.replace(/\s+/g, " ").trim().length > 250;
    const hasLeadershipSignals = /(founder|co-founder|ceo|leadership|team|our story|mission|executive)/i.test(
      combinedAboutText,
    );
    const hasAuthorBioSignals = /(author|editor|linkedin|experience|years)/i.test(`${bodyText} ${combinedAboutText}`);
    const hasReviewPlatformLink =
      $('a[href*="g2.com"], a[href*="trustpilot.com"], a[href*="capterra.com"], a[href*="sourceforge.net"]').length > 0;

    const pageSpeed = await getPageSpeedMetrics(audit.targetUrl);

    const checksByKey: Record<string, CheckResult> = {
      "title-tag": {
        key: "title-tag",
        score:
          title.length >= 20 && title.length <= 60 && titleHasKeyword
            ? 95
            : title.length >= 20 && title.length <= 60
              ? 75
              : 40,
        details: `Current title: "${displayValue(title)}".\nTarget keyword(s): ${displayKeywordList}`,
        recommendation:
          titleHasKeyword
            ? "Keep keyword near the beginning and maintain this structure."
            : "Include the target keyword naturally in the title and keep it 50-60 characters.",
      },
      "meta-description": {
        key: "meta-description",
        score:
          description.length >= 120 &&
          description.length <= 160 &&
          metaHasKeyword &&
          exactKeywordInMetaCount <= 1
            ? 90
            : description.length > 0
              ? 60
              : 25,
        details: `Meta description: "${displayValue(description)}".\nLength: ${description.length} characters.\nTarget keyword(s): ${displayKeywordList}\nAny variant present: ${yesNo(metaHasKeyword)}. Exact phrase uses: ${exactKeywordInMetaCount}.`,
        recommendation:
          !metaHasKeyword
            ? "Include the target keyword once in meta description and keep it natural."
            : description.length > 160
            ? "Trim the description to around 150-160 characters and front-load value proposition."
            : description.length < 120
              ? "Expand description to include value and keyword intent while staying below 160 chars."
              : "Keep this meta description format and test copy variants.",
      },
      "meta-redundancy": {
        key: "meta-redundancy",
        score:
          description.length === 0
            ? 35
            : metaAppearsStuffed
              ? 45
              : 88,
        details: `Meta description: "${displayValue(description)}". Exact phrase repetition count: ${exactKeywordInMetaCount}. Stuffing detected: ${yesNo(
          metaAppearsStuffed,
        )}.`,
        recommendation:
          metaAppearsStuffed
            ? "Reduce repeated keyword phrases in meta copy and prioritize one clear value proposition."
            : "Keep meta copy natural and avoid repeated phrase patterns that feel stuffed.",
      },
      "h1-count": {
        key: "h1-count",
        score:
          h1Count === 1 && h1ContainsKeyword
            ? 95
            : h1Count === 1
              ? 45
              : h1Count === 0
                ? 35
                : 50,
        details: `Detected ${h1Count} H1 tags.\nCurrent H1: "${displayValue(h1Text)}".\nTarget keyword(s): ${displayKeywordList}\nAny variant present in H1: ${h1ContainsKeyword}.`,
        recommendation:
          h1Count === 1 && h1ContainsKeyword
            ? "Maintain one clear H1 aligned with title intent."
            : "Use exactly one H1 that reflects your target keyword and page purpose.",
      },
      "h2-keyword": {
        key: "h2-keyword",
        score: h2WithKeywordCount > 0 ? 88 : h2Count > 0 ? 48 : 35,
        details: `H2 headings found: ${h2Count}.\nTarget keyword(s): ${displayKeywordList}\nH2 headings containing any keyword variant: ${h2WithKeywordCount}.`,
        recommendation:
          h2WithKeywordCount > 0
            ? "Keep at least one meaningful H2 aligned with the target keyword."
            : "Include the target keyword naturally in at least one H2 heading.",
      },
      "heading-hierarchy": {
        key: "heading-hierarchy",
        score:
          h1Count === 1 &&
          firstHeadingIsH1 &&
          h2Count > 0 &&
          (h3Count === 0 || h2Count >= Math.floor(h3Count / 2)) &&
          footerH2Count === 0
            ? 88
            : 48,
        details: `First heading tag: ${firstHeadingTag || "none"}. Heading counts: H1=${h1Count}, H2=${h2Count}, H3=${h3Count}, footer H2=${footerH2Count}. Issues: ${
          headingHierarchyIssues.length > 0 ? headingHierarchyIssues.join("; ") : "none"
        }.`,
        recommendation:
          "Use one H1 as the first heading on the page, then structure sections with clear H2/H3 hierarchy.",
      },
      "keyword-usage": {
        key: "keyword-usage",
        score: keywordCount >= 2 && keywordDensity < 1.5 && wordCount >= 700 ? 85 : 55,
        details: `Word count: ${wordCount}.\nTarget keyword(s): ${displayKeywordList}\nExact occurrences (combined): ${keywordCount}. Density: ${keywordDensity.toFixed(2)}%.`,
        recommendation:
          "Increase topical depth and include relevant keyword variants in descriptive sections.",
      },
      "structured-data": {
        key: "structured-data",
        score: schemaScripts.length === 0 ? 45 : validSchemaCount === schemaScripts.length ? 90 : 30,
        details: `JSON-LD blocks found: ${schemaScripts.length}. Valid blocks: ${validSchemaCount}. Invalid blocks: ${invalidSchemaIndexes.join(", ") || "none"}.`,
        recommendation:
          validSchemaCount === schemaScripts.length
            ? "Structured data is valid; consider expanding with FAQ and organization data."
            : "Fix invalid JSON-LD syntax to restore rich result eligibility.",
      },
      "schema-coverage": {
        key: "schema-coverage",
        score:
          schemaScripts.length === 0
            ? 35
            : hasFaqSchema && hasOrganizationSchema && hasWebSiteSchema
              ? 90
              : hasOrganizationSchema || hasWebSiteSchema
                ? 68
                : 48,
        details: `Schema types detected: ${parsedSchemaTypes.join(", ") || "none"}. FAQ: ${hasFaqSchema}, Organization: ${hasOrganizationSchema}, WebSite: ${hasWebSiteSchema}.`,
        recommendation:
          hasFaqSchema && hasOrganizationSchema && hasWebSiteSchema
            ? "Schema coverage is strong. Keep entities synchronized with visible page content."
            : "Add/repair FAQPage, Organization, and WebSite schema where relevant to improve rich-result eligibility.",
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
        score: hreflangTags.length === 0 ? 60 : hasXDefault ? 85 : 65,
        details: `Hreflang entries: ${formatList(hreflangEntries)}. x-default present: ${yesNo(
          hasXDefault,
        )}. x-default href: ${xDefaultHref?.toString() ?? "missing"}.`,
        recommendation:
          "Ensure x-default points to your canonical default page and locale URLs are in sitemap.",
      },
      sitemap: {
        key: "sitemap",
        score:
          reachableRootSitemaps.length > 0
            ? sitemapHasHome && submittedPageInSitemap
              ? 92
              : sitemapHasHome || submittedPageInSitemap
                ? 68
                : 45
            : 20,
        details:
          reachableRootSitemaps.length > 0
            ? `Sitemap URLs checked: ${formatList(rootSitemapCandidates)}. Reachable sitemap URLs: ${formatList(
                reachableRootSitemapUrls,
              )}. URLs listed: ${sitemapLocs.length}. Submitted page: ${submittedComparable ?? audit.targetUrl}. Submitted page in sitemap: ${yesNo(
                submittedPageInSitemap,
              )}.`
            : `No reachable sitemap found. Checked: ${formatList(rootSitemapCandidates)}.`,
        recommendation:
          "Ensure homepage and the exact submitted URL are listed in sitemap coverage.",
      },
      "sitemap-depth": {
        key: "sitemap-depth",
        score:
          reachableRootSitemaps.length === 0
            ? 25
            : sitemapBlogArticleCount >= 3
              ? 88
              : sitemapBlogArticleCount >= 1
                ? 68
                : 45,
        details: `Total sitemap page URLs: ${sitemapLocs.length}. Sample sitemap URLs: ${formatList(
          sampleSitemapLocs,
        )}. Blog/article URLs detected: ${sitemapBlogArticleCount}. Locale root URLs detected: ${sitemapLocaleCount}.`,
        recommendation:
          sitemapBlogArticleCount >= 3
            ? "Sitemap depth is healthy. Keep article URLs fresh and include new content quickly."
            : "Include deeper content URLs (blog/news/articles) and not just section hubs in sitemap.xml.",
      },
      robots: {
        key: "robots",
        score:
          robotsText && robotsDeclaresSitemap && robotsAllowsGoogle && robotsSitemapUrls.length > 0
            ? 88
            : robotsText
              ? 60
              : 30,
        details: robotsText
          ? `robots.txt URL: ${origin}/robots.txt. Sitemap declared: ${yesNo(
              robotsDeclaresSitemap,
            )}. Sitemap URLs in robots: ${formatList(robotsSitemapUrls)}. Googlebot broadly allowed: ${yesNo(
              robotsAllowsGoogle,
            )}.`
          : `robots.txt not detected at ${origin}/robots.txt.`,
        recommendation:
          "Declare explicit sitemap URL(s) in robots.txt and avoid blocking key public pages unintentionally.",
      },
      "robots-ai-policy": {
        key: "robots-ai-policy",
        score: !robotsText ? 45 : aiBotBlocked ? 75 : 60,
        details: robotsText
          ? `AI crawler directives present: ${yesNo(aiBotBlocked)}. Matched bots: ${formatList(
              matchedAiBots,
              "none",
            )}.`
          : `robots.txt missing at ${origin}/robots.txt, AI crawler policy cannot be verified.`,
        recommendation:
          "Define an explicit AI crawler policy in robots.txt based on your content licensing and discoverability goals.",
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
            : clamp(100 - Math.round(((missingAlt + imageWithGenericAlt) / images.length) * 100), 35, 98),
        details: `Images: ${images.length}. Missing alt text: ${missingAlt}. Generic alt text: ${imageWithGenericAlt}.`,
        recommendation:
          "Add contextual alt text to meaningful images and decorative alt=\"\" where appropriate.",
      },
      "image-performance": {
        key: "image-performance",
        score:
          images.length === 0
            ? 80
            : nonLazyImages <= 2 && preloadImageCount >= 1
              ? 88
              : nonLazyImages <= Math.ceil(images.length * 0.4)
                ? 66
                : 45,
        details: `Total images: ${images.length}. Non-lazy images: ${nonLazyImages}. Preload image hints: ${preloadImageCount}.`,
        recommendation:
          "Lazy-load below-fold images and preload key LCP image assets for stronger Core Web Vitals.",
      },
      "render-blocking-resources": {
        key: "render-blocking-resources",
        score:
          renderBlockingScripts.length === 0 && nonPreloadedStylesheetCount <= 2
            ? 92
            : renderBlockingScripts.length <= 1 && nonPreloadedStylesheetCount <= 3
              ? 82
              : renderBlockingScripts.length <= 2
                ? 62
                : 42,
        details: `Head scripts without async/defer/module: ${renderBlockingScripts.length} (${formatList(
          renderBlockingScriptUrls,
          "none",
          4,
        )}). Stylesheets discovered: ${stylesheetUrls.length}. Stylesheets without preload hint: ${nonPreloadedStylesheetCount}.`,
        recommendation:
          "Move non-critical scripts out of head or add defer/async, and preload only the CSS needed for first paint.",
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
        details: `Core assets checked: ${successfulCoreAssetProbes.length}/${coreAssetCandidates.length}. Weak cache-control assets: ${
          weakCacheAssets.length
        } (${formatList(weakCacheAssets.map((asset) => asset.url), "none", 3)}). Uncompressed text assets: ${
          uncompressedAssets.length
        } (${formatList(uncompressedAssets.map((asset) => asset.url), "none", 3)}).`,
        recommendation:
          "Set long-lived cache-control on versioned JS/CSS assets and enable Brotli/Gzip compression for text resources.",
      },
      "third-party-script-weight": {
        key: "third-party-script-weight",
        score:
          thirdPartyScriptUrls.length === 0
            ? 92
            : thirdPartyScriptUrls.length <= 2 && thirdPartyScriptDomains.length <= 2
              ? 84
              : thirdPartyScriptUrls.length <= 5
                ? 64
                : 42,
        details: `Third-party scripts found: ${thirdPartyScriptUrls.length}. External domains: ${thirdPartyScriptDomains.length} (${formatList(
          thirdPartyScriptDomains,
          "none",
          5,
        )}).`,
        recommendation:
          "Limit third-party tags, load them after critical content, and remove vendors that do not create measurable business value.",
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
        details: `Internal links checked: ${internalLinkCandidates.length}. Broken (4xx/5xx): ${
          brokenInternalLinks.length
        } (${formatList(brokenInternalLinks.map((item) => item.url), "none", 3)}). Excessive redirect chains (3+ hops): ${
          excessiveRedirectInternalLinks.length
        } (${formatList(excessiveRedirectInternalLinks.map((item) => item.url), "none", 3)}).`,
        recommendation:
          "Fix broken internal links and update URLs that pass through long redirect chains.",
      },
      "site-architecture": {
        key: "site-architecture",
        score: internalUniquePaths.size >= 5 ? 84 : internalUniquePaths.size >= 3 ? 66 : 44,
        details: `Unique internal paths linked from page: ${internalUniquePaths.size}.`,
        recommendation:
          "Support core landing page with additional crawlable pages for related intents and long-tail queries.",
      },
      "eeat-signals": {
        key: "eeat-signals",
        score:
          hasTestimonials && (hasAboutPageLink || hasAboutPageContent) && (hasLeadershipSignals || hasAuthorBioSignals)
            ? 88
            : (hasTestimonials || hasReviewPlatformLink || hasAboutPageLink || hasAboutPageContent) && wordCount >= 600
              ? 72
              : 52,
        details: `Signals found - testimonials/case studies: ${hasTestimonials}, about link on page: ${hasAboutPageLink}, reachable about pages: ${reachableAboutPages}, leadership/author signals: ${
          hasLeadershipSignals || hasAuthorBioSignals
        }, review platform link: ${hasReviewPlatformLink}. About link matches: ${formatList(aboutLinkMatches, "none")}.`,
        recommendation:
          hasTestimonials && (hasAboutPageLink || hasAboutPageContent)
            ? "E-E-A-T baseline is present. Strengthen it further with richer proof points (named outcomes, expert profiles, and third-party validation)."
            : "Add clearer trust signals only where missing: testimonials/case studies, visible team/about details, and expert credibility cues.",
      },
      "author-credibility": {
        key: "author-credibility",
        score: hasNamedAuthor || hasAuthorBioSignals ? 84 : hasAboutPageLink || hasAboutPageContent ? 68 : 40,
        details: `Named author/team signal detected: ${hasNamedAuthor || hasAuthorBioSignals}. About page linked: ${hasAboutPageLink}. About link matches: ${formatList(
          aboutLinkMatches,
          "none",
        )}. Reachable about page content: ${hasAboutPageContent}.`,
        recommendation:
          hasNamedAuthor || hasAuthorBioSignals
            ? "Maintain visible expert attribution and keep author/team credentials up to date."
            : "Add named experts/authors with profile details and stronger team transparency.",
      },
      pagespeed: {
        key: "pagespeed",
        score: pageSpeed?.score ?? 58,
        details: pageSpeed
          ? `PageSpeed score: ${pageSpeed.score}/100. LCP: ${pageSpeed.lcp}, CLS: ${pageSpeed.cls}, INP: ${pageSpeed.inp}.`
          : "PageSpeed API not configured, using fallback scoring.",
        recommendation:
          pageSpeed && pageSpeed.score !== null && pageSpeed.score >= 80
            ? "Maintain current performance and keep monitoring core vitals."
            : "Optimize LCP assets, reduce layout shifts, and improve interaction responsiveness.",
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
      "safe-browsing": {
        key: "safe-browsing",
        score: !safeBrowsing.configured ? 60 : safeBrowsing.error ? 55 : safeBrowsing.flagged ? 15 : 95,
        details: !safeBrowsing.configured
          ? "Google Safe Browsing API key is not configured."
          : safeBrowsing.error
            ? `Safe Browsing check failed: ${safeBrowsing.error}.`
            : `Safe Browsing flagged URL: ${yesNo(safeBrowsing.flagged)}. Threat types: ${formatList(
                safeBrowsing.threatTypes,
                "none",
              )}.`,
        recommendation: !safeBrowsing.configured
          ? "Add GOOGLE_SAFE_BROWSING_API_KEY to enable malware/phishing risk checks."
          : safeBrowsing.flagged
            ? "Investigate and remediate malware/phishing risk before indexing and promotion."
            : "No threat match found. Keep routine security monitoring in place.",
      },
    };

    const effectivePriorityByKey: Record<string, "critical" | "high" | "medium" | "low"> = {
      canonical: "critical",
      pagespeed: (checksByKey.pagespeed?.score ?? 58) >= 60 ? "medium" : "high",
      "title-tag": titleHasKeyword ? "high" : "critical",
      "h1-count": h1ContainsKeyword ? "high" : "critical",
      "safe-browsing": safeBrowsing.flagged ? "critical" : "high",
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
      Math.round(weighted.reduce((acc, entry) => acc + entry.weightedScore, 0) / totalWeight),
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

    await prisma.$transaction(
      async (tx) => {
        await tx.auditCheck.deleteMany({ where: { auditId } });
        await tx.auditCheck.createMany({
          data: checksPayload,
        });
        await tx.audit.update({
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
        });
      },
      AUDIT_COMPLETION_TRANSACTION,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown audit error";
    await prisma.audit.update({
      where: { id: auditId },
      data: {
        status: AuditStatus.FAILED,
        errorMessage: message,
      },
    });
  }
}
