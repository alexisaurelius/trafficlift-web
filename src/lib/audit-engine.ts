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

type CheckResult = {
  key: string;
  score: number;
  details: string;
  recommendation: string;
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

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.text();
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
  return {
    title: $("title").text().trim(),
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

function statusFromCheckScore(checkScore: number): "pass" | "fail" {
  return checkScore >= 80 ? "pass" : "fail";
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
) {
  const croPriorityRank = (priority: string) => {
    if (priority === "critical") return 4;
    if (priority === "high") return 3;
    if (priority === "medium") return 2;
    return 1;
  };
  const byPriority = {
    critical: checks.filter((c) => c.priority === "critical" && c.status !== "pass"),
    high: checks.filter((c) => c.priority === "high" && c.status !== "pass"),
    medium: checks.filter((c) => c.priority === "medium" && c.status !== "pass"),
    low: checks.filter((c) => c.priority === "low" && c.status !== "pass"),
  };

  const lines: string[] = [];
  lines.push(`# CRO Audit Report`);
  lines.push(``);
  lines.push(`- URL: ${targetUrl}`);
  lines.push(`- Score: ${score}/100`);
  lines.push(``);
  lines.push(`## Executive Summary`);
  lines.push(
    score >= 80
      ? `Strong conversion baseline with selective optimization opportunities.`
      : `High-impact conversion friction was detected across key decision points.`,
  );
  const topRisks = checks
    .filter((c) => c.status !== "pass")
    .sort((a, b) => croPriorityRank(b.priority) - croPriorityRank(a.priority))
    .slice(0, 3);
  lines.push(``);
  lines.push(`## Critical Conversion Risks`);
  if (topRisks.length === 0) {
    lines.push(`- No critical conversion blockers detected.`);
  } else {
    topRisks.forEach((risk) => {
      lines.push(`- ${risk.title}: ${risk.recommendation}`);
    });
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

function buildCroChecks($: ReturnType<typeof load>, bodyText: string, title: string, description: string) {
  const popupCandidates = $('[class*="popup" i], [id*="popup" i], [class*="modal" i], [id*="modal" i], [aria-modal="true"], [role="dialog"]')
    .toArray()
    .filter((el) => {
      const classAndId = `${$(el).attr("class") ?? ""} ${$(el).attr("id") ?? ""}`.toLowerCase();
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const hasPopupLanguage = /(popup|modal|subscribe|newsletter|offer|cookie|close|accept|dismiss)/i.test(
        `${classAndId} ${text}`,
      );
      return text.length >= 40 && hasPopupLanguage;
    });
  const popupCount = popupCandidates.length;
  const hasCookieBanner = /(cookie consent|cookie settings|accept cookies|cookie policy)/i.test(bodyText);
  const cookieCueMatches = collectMatches(bodyText, /cookie consent|cookie settings|accept cookies|cookie policy/gi, 5);
  const cookieUiBlocks = $('[class*="cookie" i], [id*="cookie" i], [data-cookie], [aria-label*="cookie" i]')
    .toArray()
    .filter((el) => {
      const classAndStyle = `${$(el).attr("class") ?? ""} ${$(el).attr("style") ?? ""}`.toLowerCase();
      return /(fixed|sticky|banner|consent|bottom)/i.test(classAndStyle);
    }).length;
  const h1Node = $("h1").first();
  const h1Text = h1Node.text().trim();
  const actionCtaRegex = /(get started|get a demo|buy|order|start|sign up|subscribe|shop|audit|checkout|pricing|book|trial|start for free|talk to sales)/i;
  const getInteractiveText = (el: AnyNode) => {
    const directText = $(el).text().replace(/\s+/g, " ").trim();
    const value = ($(el).attr("value") ?? "").replace(/\s+/g, " ").trim();
    const ariaLabel = ($(el).attr("aria-label") ?? "").replace(/\s+/g, " ").trim();
    return directText || value || ariaLabel;
  };
  const ctaElements = $("a,button,[role='button'],input[type='submit'],input[type='button']")
    .toArray()
    .filter((el) => $(el).closest("footer").length === 0)
    .filter((el) => {
      const text = getInteractiveText(el);
      if (!text || text.length > 48) return false;
      return actionCtaRegex.test(text);
    });
  const ctaButtons = ctaElements
    .map((el) => getInteractiveText(el))
    .filter(Boolean);
  const buttonLikeCtaCount = ctaElements.filter((el) => {
    const tagName = (el.tagName ?? "").toLowerCase();
    const role = ($(el).attr("role") ?? "").toLowerCase();
    const className = ($(el).attr("class") ?? "").toLowerCase();
    if (tagName === "button" || tagName === "input" || role === "button") return true;
    return /(btn|button|cta|primary|action)/i.test(className);
  }).length;
  const ctaWithCheckoutPathCount = ctaElements.filter((el) => {
    const href = ($(el).attr("href") ?? $(el).attr("formaction") ?? "").toLowerCase();
    return /(checkout|pricing|shop|buy|order|billing|cart|signup|sign-up|register|trial)/i.test(href);
  }).length;
  const h1PrimaryContainer = h1Node.closest("section,header,main,article");
  const h1FallbackContainer = h1Node.closest("div");
  const collectScopeCtas = (scope: Cheerio<AnyNode>) =>
    scope
      .find("a,button,[role='button'],input[type='submit'],input[type='button']")
      .toArray()
      .map((el) => getInteractiveText(el))
      .filter((text) => actionCtaRegex.test(text));
  let heroCtas = collectScopeCtas(h1PrimaryContainer);
  if (heroCtas.length === 0) {
    heroCtas = collectScopeCtas(h1FallbackContainer);
  }
  if (heroCtas.length === 0) {
    heroCtas = $("header,section,main,article")
      .slice(0, 3)
      .toArray()
      .flatMap((el) => collectScopeCtas($(el)));
  }
  const uniqueHeroCtas = [...new Set(heroCtas.map((text) => text.toLowerCase()))];
  const hasDualHeroCta = uniqueHeroCtas.length >= 2;
  const ctaInHero = uniqueHeroCtas.length > 0;
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
    heroText,
    /(trusted by|used by|customers|businesses|brands|teams).{0,36}(\d[\d,.]*\+|thousands?)/gi,
    4,
  );
  const heroCustomerCountSignal = heroCustomerCountMatches.length > 0;
  const hasAiPromptEarly = /(ask our ai|ai assistant|see if .* right for you|ask ai)/i.test(earlyText);
  const heroHasReassuranceMicrocopy = /(no credit card|cancel anytime|full access|risk-free|free trial|no commitment|3 days free|7 days free|14 days free)/i.test(
    heroText,
  );
  const ctaButtonsCount = [...new Set(ctaButtons.map((text) => text.toLowerCase()))].length;
  const testimonialCueMatches = collectMatches(
    bodyText,
    /testimonial|reviews?|rating|trusted by|as seen in|customers? served|backed by|users? joined|customers? joined|case studies?/gi,
    8,
  );
  const hasTestimonialSignal = testimonialCueMatches.length > 0;
  const supportCueMatches = collectMatches(bodyText, /live chat|chatbot|support@|contact us|help center|faq/gi, 8);
  const hasSupportProofSignal = supportCueMatches.length > 0;
  const trustSignalsCount = [hasTestimonialSignal, heroCustomerCountSignal, hasSupportProofSignal].filter(Boolean).length;
  const headerLinks = $("header a").toArray();
  const navLinks = headerLinks.length;
  const navLinkSamples = headerLinks
    .map((el) => getInteractiveText(el))
    .filter(Boolean)
    .slice(0, 8);
  const hasShopNav = headerLinks.some((el) => /(buy|shop|pricing|get started|sign up|checkout)/i.test($(el).text()));
  const formFieldCount = $("form input, form select, form textarea").length;
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
  const viewportContent = $('meta[name="viewport"]').attr("content")?.trim() ?? "";
  const hasViewportMeta = Boolean(viewportContent);
  const hasSupport = /(live chat|chatbot|support@|contact us|help center|faq)/i.test(bodyText);
  const hasFaqHeading = $("h2,h3,h4")
    .toArray()
    .some((el) => /(faq|frequently asked|questions)/i.test($(el).text()));
  const faqHeadingSamples = $("h2,h3,h4")
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .filter((text) => /(faq|frequently asked|questions)/i.test(text))
    .slice(0, 5);
  const hasFaqQuestionSet = $("details summary")
    .toArray()
    .filter((el) => /\?$/.test($(el).text().trim())).length >= 3;
  const hasFaqSignals = hasFaqHeading || hasFaqQuestionSet;
  const faqQuestionCount = $("section,article,div")
    .toArray()
    .filter((el) => /(faq|frequently asked|questions)/i.test($(el).text()))
    .flatMap((el) => {
      const section = $(el);
      const detailQuestions = section
        .find("details summary")
        .toArray()
        .map((node) => $(node).text().trim())
        .filter((text) => text.endsWith("?"));
      const headingQuestions = section
        .find("h3,h4,p,li")
        .toArray()
        .map((node) => $(node).text().replace(/\s+/g, " ").trim())
        .filter((text) => /\?$/.test(text));
      return [...detailQuestions, ...headingQuestions];
    }).length;
  const hasUrgency = /(limited|ends soon|today only|free shipping|save \d+%|offer expires)/i.test(bodyText);
  const hasRiskReversal = /(no credit card|cancel anytime|free trial|risk-free|money-back|no commitment|guarantee)/i.test(
    bodyText,
  );
  const analyticsSignalMatches = collectMatches($.html() ?? "", /googletagmanager|gtag\(|datalayer|fbq\(|clarity|hotjar|analytics/gi, 8);
  const hasAnalytics = analyticsSignalMatches.length > 0;
  const earlyTrustBadgeMatches = collectMatches(earlyText, /g2|capterra|getapp|trustpilot|as seen in|award|badge/gi, 6);
  const hasEarlyTrustBadges = earlyTrustBadgeMatches.length > 0;
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
  const quantifiedOutcomeCount = (bodyText.match(/(\d{1,3}(?:[.,]\d+)?\s?%|\d+(?:\.\d+)?x|\d+\+|\d+\s?(?:weeks?|months?|days?))/gi) ?? [])
    .length;
  const integrationMentions = [...new Set(
    (bodyText.match(/shopify|quickbooks|xero|hubspot|woocommerce|bigcommerce|amazon|api/gi) ?? []).map((v) =>
      v.toLowerCase(),
    ),
  )];
  const hasIntegrationProof = /integrations?|connect|ecosystem|api/i.test(bodyText) && integrationMentions.length >= 2;
  const readMoreCtaCount = $("a,button")
    .toArray()
    .filter((el) => /^read more\b/i.test($(el).text().replace(/\s+/g, " ").trim())).length;
  const hasWeakReadMorePattern = readMoreCtaCount >= 3;
  const pricingSections = $("section,article,div")
    .toArray()
    .filter((el) => /(pricing|plan|billing|subscription)/i.test($(el).text()));
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
  const hasPricingTable = $("table")
    .toArray()
    .some((el) => /(plan|pricing|features?|compare|included)/i.test($(el).text()));
  const estimatedPlanCount = $("section,article,div")
    .toArray()
    .filter((el) => /(\/month|\/mo|monthly|yearly|per month|start for free|get started)/i.test($(el).text())).length;
  const hasThreePlusPlanSignals = estimatedPlanCount >= 3 || genericPlanNameCount >= 3;
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
  const hasBottomCta = sectionNodes
    .slice(-2)
    .some((section) =>
      $(section)
        .find("a,button")
        .toArray()
        .some((el) => actionCtaRegex.test($(el).text().replace(/\s+/g, " ").trim())),
    );
  const footerCtaTexts = $("footer a, footer button")
    .toArray()
    .map((el) => $(el).text().replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const footerHasSignIn = footerCtaTexts.some((text) => /(sign in|log in)/i.test(text));
  const footerHasContextLine = /(no credit card|cancel anytime|setup in|minutes|risk-free|free trial|no commitment)/i.test(
    footerText,
  );
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
  const cyrillicChars = (bodyText.match(/[А-Яа-яЁё]/g) ?? []).length;
  const latinChars = (bodyText.match(/[A-Za-z]/g) ?? []).length;
  const htmlLang = ($("html").attr("lang") ?? "").toLowerCase();
  const mixedLanguageLikely = cyrillicChars >= 80 && latinChars >= 300 && cyrillicChars / Math.max(latinChars, 1) > 0.1;
  const langMismatchLikely = htmlLang.startsWith("en") && cyrillicChars > latinChars * 0.2;

  const checksByKey: Record<string, CheckResult> = {
    "entry-experience": {
      key: "entry-experience",
      score: popupCount === 0 ? 86 : popupCount <= 1 ? 68 : 42,
      details: `Popup/modal-like overlays detected: ${popupCount}. Cookie-consent presence detected: ${yesNo(
        hasCookieBanner,
      )}. Cookie cues matched: ${formatList(cookieCueMatches, "none", 4)}. Fixed/sticky cookie UI blocks detected: ${cookieUiBlocks}. Cookie banners are treated as normal compliance UI and are not penalized alone.`,
      recommendation:
        popupCount > 0
          ? "Critical: remove or delay blocking popups until intent/engagement is shown. Keep a single CTA per modal."
          : "Entry experience looks clean. Keep first view focused on value and one next action.",
    },
    "hero-clarity": {
      key: "hero-clarity",
      score: h1Text.length >= 10 && ctaInHero ? 88 : h1Text.length >= 10 ? 56 : 28,
      details: `Hero H1: "${displayValue(h1Text)}". Hero CTA detected: ${yesNo(ctaInHero)}. Hero CTA samples: ${formatList(uniqueHeroCtas, "none", 4)}.`,
      recommendation:
        "Critical: ensure headline clearly explains what the product is and keep a strong primary CTA visible above the fold.",
    },
    "hero-dual-cta": {
      key: "hero-dual-cta",
      score: hasDualHeroCta ? 86 : ctaInHero ? 58 : 34,
      details: `Unique hero CTA variants detected: ${uniqueHeroCtas.length}. Hero CTAs: ${formatList(uniqueHeroCtas, "none", 4)}.`,
      recommendation:
        hasDualHeroCta
          ? "Dual CTA strategy is present. Keep primary vs secondary action hierarchy visually clear."
          : "Add complementary hero CTAs (e.g., self-serve + assisted/demo) to capture different buyer intent stages.",
    },
    "cta-microcopy-reassurance": {
      key: "cta-microcopy-reassurance",
      score: heroHasReassuranceMicrocopy ? 88 : 46,
      details: `Risk-reversal microcopy near hero CTA detected: ${yesNo(heroHasReassuranceMicrocopy)}.`,
      recommendation:
        heroHasReassuranceMicrocopy
          ? "Keep reassurance microcopy directly below hero CTA and concise."
          : "Add brief reassurance copy under hero CTA (no credit card, free trial window, cancel anytime).",
    },
    "hero-ai-prompt": {
      key: "hero-ai-prompt",
      score: hasAiPromptEarly ? 82 : 56,
      details: `AI-discovery prompt detected in hero/early section: ${yesNo(hasAiPromptEarly)}.`,
      recommendation:
        hasAiPromptEarly
          ? "AI discovery prompt is visible early. Keep it concise and tied to user intent."
          : "Consider an above-the-fold AI guidance prompt for uncertain visitors to reduce early drop-off.",
    },
    "value-proposition": {
      key: "value-proposition",
      score: title.length > 20 && description.length > 90 ? 82 : 50,
      details: `Title: "${displayValue(title)}". Meta description length: ${description.length}.`,
      recommendation:
        "State your core value proposition earlier and align page messaging with user intent and objections.",
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
      score: quantifiedOutcomeCount >= 4 ? 86 : quantifiedOutcomeCount >= 2 ? 66 : 42,
      details: `Quantified outcome cues detected: ${quantifiedOutcomeCount}.`,
      recommendation:
        quantifiedOutcomeCount >= 2
          ? "Keep quantified outcomes near CTAs and feature claims to reinforce credibility."
          : "Add concrete proof points (% uplift, time-to-value, implementation timelines) in key decision sections.",
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
    "cta-audit": {
      key: "cta-audit",
      score: ctaButtonsCount >= 4 ? 84 : ctaButtonsCount >= 2 ? 58 : 26,
      details: `CTA-like elements detected: ${ctaButtonsCount}. Button-like CTA elements: ${buttonLikeCtaCount}. Sample CTAs: ${formatList(ctaButtons, "none", 6)}.`,
      recommendation:
        "Critical: place clear high-contrast CTAs at decision points and use direct action language tied to outcome.",
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
      score: hasThreePlusPlanSignals && hasPricingTable ? 84 : hasThreePlusPlanSignals ? 48 : 74,
      details: `3+ plan signals detected: ${yesNo(hasThreePlusPlanSignals)}. Comparison table/matrix detected: ${yesNo(hasPricingTable)}.`,
      recommendation:
        hasThreePlusPlanSignals && !hasPricingTable
          ? "For 3+ plans, add clearer side-by-side comparison signals so users can self-qualify quickly."
          : "Pricing comparison clarity looks acceptable for the detected plan structure.",
    },
    "click-distance": {
      key: "click-distance",
      score: ctaWithCheckoutPathCount >= 2 ? 84 : ctaWithCheckoutPathCount === 1 ? 64 : 36,
      details: `CTA links with purchase/pricing intent detected: ${ctaWithCheckoutPathCount}.`,
      recommendation:
        "Reduce click distance to pricing/checkout and keep purchase paths visible from the landing page.",
    },
    "social-proof": {
      key: "social-proof",
      score: trustSignalsCount >= 3 ? 86 : trustSignalsCount === 2 ? 60 : trustSignalsCount === 1 ? 36 : 18,
      details: `Trust signal clusters detected: ${trustSignalsCount}. Testimonial/review cues: ${formatList(
        testimonialCueMatches,
        "none",
        6,
      )}. Hero customer-count cues: ${formatList(heroCustomerCountMatches, "none", 3)}.`,
      recommendation:
        "Critical: keep visible testimonial/review credibility cues and customer-count proof in key decision sections.",
    },
    "early-social-proof-badges": {
      key: "early-social-proof-badges",
      score: hasEarlyTrustBadges ? 84 : 48,
      details: `Early trust badge/award cues near hero detected: ${yesNo(hasEarlyTrustBadges)}. Matched cues: ${formatList(
        earlyTrustBadgeMatches,
        "none",
        5,
      )}.`,
      recommendation:
        hasEarlyTrustBadges
          ? "Early social proof badges are present. Keep them close to primary conversion actions."
          : "Add recognizable third-party proof badges (awards/review platforms) near hero CTAs.",
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
    "nav-architecture": {
      key: "nav-architecture",
      score: navLinks >= 3 && hasShopNav ? 80 : navLinks >= 2 ? 58 : 38,
      details: `Header links detected: ${navLinks}. Header link samples: ${formatList(navLinkSamples, "none", 6)}. Conversion-path nav item present: ${yesNo(
        hasShopNav,
      )}.`,
      recommendation:
        "Keep conversion paths obvious in navigation and include an always-visible action path to purchase/signup.",
    },
    "language-consistency": {
      key: "language-consistency",
      score: mixedLanguageLikely || langMismatchLikely ? 24 : 84,
      details: `Latin chars: ${latinChars}. Cyrillic chars: ${cyrillicChars}. HTML lang: "${displayValue(htmlLang)}". Mixed-language risk: ${yesNo(
        mixedLanguageLikely || langMismatchLikely,
      )}.`,
      recommendation:
        mixedLanguageLikely || langMismatchLikely
          ? "Fix localization consistency (single language per page or explicit locale routing) to avoid trust and comprehension loss."
          : "Language consistency looks clean for the detected page content.",
    },
    "funnel-friction": {
      key: "funnel-friction",
      score: formFieldCount <= 4 ? 82 : formFieldCount <= 8 ? 55 : 30,
      details: `Form fields detected across page: ${formFieldCount}.`,
      recommendation:
        "Critical: minimize form and checkout friction by removing non-essential fields and reducing steps.",
    },
    "offer-communication": {
      key: "offer-communication",
      score: /features|benefits|compare|faq|how it works/i.test(bodyText) ? 80 : 56,
      details: "Offer communication signals checked for feature context, comparison content, and objection handling.",
      recommendation:
        "Pair feature claims with clear user outcomes and answer common objections near decision points.",
    },
    "integration-ecosystem-proof": {
      key: "integration-ecosystem-proof",
      score: hasIntegrationProof ? 84 : 46,
      details: `Integration ecosystem signals detected: ${yesNo(hasIntegrationProof)}. Recognized integration mentions: ${formatList(
        integrationMentions,
        "none",
        6,
      )}.`,
      recommendation:
        hasIntegrationProof
          ? "Integration proof is visible. Keep recognizable partner logos close to integration CTAs."
          : "Show ecosystem compatibility earlier with recognizable integration names/logos and a clear integrations CTA.",
    },
    "feature-cta-clarity": {
      key: "feature-cta-clarity",
      score: hasWeakReadMorePattern ? 42 : 80,
      details: `Generic 'Read more' CTA count detected: ${readMoreCtaCount}.`,
      recommendation:
        hasWeakReadMorePattern
          ? "Replace repetitive 'Read more' CTAs with intent-specific actions (e.g., 'See how it works', 'Explore features')."
          : "Feature CTA language looks action-oriented and specific.",
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
    "mobile-experience": {
      key: "mobile-experience",
      score: hasViewportMeta && ctaButtonsCount >= 2 && buttonLikeCtaCount >= 1 ? 82 : hasViewportMeta ? 64 : 35,
      details: `Viewport meta present: ${yesNo(hasViewportMeta)} (content: "${displayValue(
        viewportContent,
      )}"). CTA-like elements: ${ctaButtonsCount}. Button-like CTAs: ${buttonLikeCtaCount}.`,
      recommendation:
        "Maintain mobile-first readability, tap target sizing, and friction-free interaction patterns.",
    },
    "support-objections": {
      key: "support-objections",
      score: hasSupport && hasFaqSignals ? 88 : hasSupport ? 68 : 46,
      details: `Support signals detected: ${yesNo(hasSupport)}. Support cues: ${formatList(
        supportCueMatches,
        "none",
        5,
      )}. FAQ-style objection section detected: ${yesNo(hasFaqSignals)}. FAQ heading samples: ${formatList(
        faqHeadingSamples,
        "none",
        4,
      )}.`,
      recommendation:
        "Expose support channels and objection-handling answers earlier to reduce purchase hesitation.",
    },
    "faq-depth": {
      key: "faq-depth",
      score: faqQuestionCount >= 7 ? 86 : faqQuestionCount >= 4 ? 62 : 38,
      details: `FAQ-style question count detected: ${faqQuestionCount}.`,
      recommendation:
        faqQuestionCount >= 7
          ? "FAQ depth is strong. Keep adding high-anxiety objections (billing, fit, security, cancellation)."
          : "Expand FAQ depth with high-anxiety questions (cancellation, usage limits, fit, security, differentiation).",
    },
    "urgency-incentives": {
      key: "urgency-incentives",
      score: hasUrgency && hasRiskReversal ? 84 : hasUrgency || hasRiskReversal ? 66 : 44,
      details: `Urgency messaging detected: ${yesNo(hasUrgency)}. Risk-reversal cues detected: ${yesNo(hasRiskReversal)}.`,
      recommendation:
        "Use honest urgency and risk-reversal cues (no credit card, cancel anytime, guarantees) near CTAs.",
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
    "final-cta-reinforcement": {
      key: "final-cta-reinforcement",
      score: hasBottomCta ? 84 : 46,
      details: `Bottom-of-page CTA block detected in final sections: ${yesNo(hasBottomCta)}.`,
      recommendation:
        hasBottomCta
          ? "Final CTA reinforcement is present. Keep one-line value recap and friction reducer near the CTA."
          : "Add a strong end-of-page CTA block that repeats core actions after users finish scanning.",
    },
    "footer-cta-clarity": {
      key: "footer-cta-clarity",
      score: footerHasContextLine ? 82 : footerCtaTexts.length > 0 ? 56 : 68,
      details: `Footer CTA count: ${footerCtaTexts.length}. Footer context/risk-reversal microcopy detected: ${yesNo(
        footerHasContextLine,
      )}. Sign-in CTA present in footer: ${yesNo(footerHasSignIn)}.`,
      recommendation:
        footerHasContextLine
          ? "Footer CTA context is clear. Keep friction-reducing microcopy close to signup action."
          : "Add a short footer CTA context line (e.g., no credit card, setup time, cancel anytime) to reduce hesitation.",
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

  const weighted = CRO_AUDIT_CHECKLIST.map((item) => {
    const check = checksByKey[item.key];
    const score = check ? check.score : 50;
    return { item, check, weightedScore: score * PRIORITY_WEIGHT[item.priority], effectivePriority: item.priority };
  });
  const totalWeight = weighted.reduce((acc, entry) => acc + PRIORITY_WEIGHT[entry.effectivePriority], 0);
  const baseScore = Math.round(weighted.reduce((acc, entry) => acc + entry.weightedScore, 0) / totalWeight);
  const criticalPenaltyCount = [
    popupCount > 0,
    !ctaInHero,
    trustSignalsCount <= 1,
    !hasAnalytics,
    mixedLanguageLikely || langMismatchLikely,
  ].filter(Boolean).length;
  const highPenaltyCount = [formFieldCount > 8, !hasSupport, !hasShopNav, hasAbstractPricingModel, faqQuestionCount < 4].filter(Boolean)
    .length;
  const score = clamp(baseScore - criticalPenaltyCount * 7 - highPenaltyCount * 3, 15, 95);

  const checksPayload = CRO_AUDIT_CHECKLIST.map((item) => {
    const check = checksByKey[item.key];
    const checkScore = check?.score ?? 50;
    return {
      key: item.key,
      title: item.title,
      priority: item.priority,
      status: statusFromCheckScore(checkScore),
      details: check?.details ?? item.description,
      recommendation: check?.recommendation ?? "Review this area and apply conversion-focused improvements.",
    };
  });

  return { score, checksPayload };
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
      const title = $("title").text().trim();
      const description = $('meta[name="description"]').attr("content") ?? "";
      const bodyText = $("body").text().replace(/\s+/g, " ").trim();
      const { score, checksPayload } = buildCroChecks($, bodyText, title, description);
      const reportMarkdown = formatCroReport(
        audit.targetUrl,
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

    const title = $("title").text().trim();
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
