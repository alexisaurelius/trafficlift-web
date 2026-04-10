import { AuditStatus } from "@prisma/client";
import { load } from "cheerio";
import { prisma } from "@/lib/prisma";
import { AUDIT_CHECKLIST } from "@/lib/seo-checklist";

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

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch page (${response.status})`);
  }

  return response.text();
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: { "user-agent": "TrafficLiftBot/1.0 (+https://trafficlift.app)" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.text();
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

function tokenizeKeyword(keyword: string) {
  return keyword
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function statusFromCheckScore(checkScore: number): "pass" | "warning" | "fail" {
  if (checkScore >= 80) return "pass";
  if (checkScore >= 55) return "warning";
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
  lines.push(`- Target keyword: "${keyword}"`);
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
  lines.push(`### Fix Immediately (Critical)`);
  if (byPriority.critical.length === 0) lines.push(`- No critical issues found.`);
  byPriority.critical.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));
  lines.push(``);
  lines.push(`### Fix Soon (High Impact)`);
  if (byPriority.high.length === 0) lines.push(`- No high-impact issues found.`);
  byPriority.high.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));
  lines.push(``);
  lines.push(`### Fix Next (Medium Impact)`);
  if (byPriority.medium.length === 0) lines.push(`- No medium-impact issues found.`);
  byPriority.medium.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));
  lines.push(``);
  lines.push(`### Long-Term (Strategic)`);
  if (byPriority.low.length === 0) lines.push(`- No low-priority strategic items found.`);
  byPriority.low.forEach((check) => lines.push(`- ${check.title}: ${check.recommendation}`));

  return lines.join("\n");
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
    const html = await fetchHtml(audit.targetUrl);
    const $ = load(html);
    const normalizedKeyword = audit.targetKeyword.toLowerCase().trim();
    const origin = new URL(audit.targetUrl).origin;

    const title = $("title").text().trim();
    const description = $('meta[name="description"]').attr("content") ?? "";
    const canonical = $('link[rel="canonical"]').attr("href") ?? "";
    const canonicalUrl = safeUrl(canonical, audit.targetUrl);
    const targetUrlNormalized = normalizeUrl(audit.targetUrl);
    const canonicalNormalized = canonicalUrl ? normalizeUrl(canonicalUrl.toString()) : null;
    const h1Count = $("h1").length;
    const h1Text = $("h1").first().text().trim();
    const h1ContainsKeyword = h1Text.toLowerCase().includes(normalizedKeyword);
    const h2Count = $("h2").length;
    const h2WithKeywordCount = $("h2")
      .toArray()
      .filter((el) => $(el).text().toLowerCase().includes(normalizedKeyword)).length;
    const h3Count = $("h3").length;
    const footerH2Count = $("footer h2").length;
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = bodyText ? bodyText.split(" ").length : 0;
    const keywordCount =
      bodyText
        .toLowerCase()
        .split(audit.targetKeyword.toLowerCase())
        .length - 1;
    const keywordDensity = wordCount > 0 ? (keywordCount / wordCount) * 100 : 0;
    const keywordInMetaCount = description
      .toLowerCase()
      .split(normalizedKeyword)
      .length - 1;

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
    const keywordTokens = tokenizeKeyword(normalizedKeyword);
    const keywordAnchorMatches = internalAnchors.filter((a) => {
      const text = $(a).text().toLowerCase().trim();
      return keywordTokens.some((token) => token.length > 3 && text.includes(token));
    }).length;
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
    const hasXDefault = hreflangTags.some((tag) => ($(tag).attr("hreflang") ?? "").toLowerCase() === "x-default");
    const xDefaultTag = hreflangTags.find((tag) => ($(tag).attr("hreflang") ?? "").toLowerCase() === "x-default");
    const xDefaultHrefRaw = xDefaultTag ? $(xDefaultTag).attr("href") ?? "" : "";
    const xDefaultHref = safeUrl(xDefaultHrefRaw, audit.targetUrl);
    const xDefaultPointsToRoot =
      xDefaultHref?.pathname === "/" || normalizeUrl(xDefaultHref?.toString() ?? "") === normalizeUrl(origin);

    const robotsText = await fetchText(`${origin}/robots.txt`);
    const robotsLower = robotsText?.toLowerCase() ?? "";
    const aiBotBlocked = /(claudebot|gptbot|bytespider|ccbot|google-extended)/i.test(robotsLower);
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
    const hasAboutPageLink = $('a[href*="about"]').length > 0;
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
          title.length >= 20 && title.length <= 60 && title.toLowerCase().includes(normalizedKeyword)
            ? 95
            : title.length >= 20 && title.length <= 60
              ? 75
              : 40,
        details: `Title length: ${title.length} characters. Current title: "${title || "Missing title"}". Target keyword present in title: ${title.toLowerCase().includes(normalizedKeyword)}.`,
        recommendation:
          title.toLowerCase().includes(normalizedKeyword)
            ? "Keep keyword near the beginning and maintain this structure."
            : "Include the target keyword naturally in the title and keep it 50-60 characters.",
      },
      "meta-description": {
        key: "meta-description",
        score:
          description.length >= 120 &&
          description.length <= 160 &&
          keywordInMetaCount > 0 &&
          keywordInMetaCount <= 1
            ? 90
            : description.length > 0
              ? 60
              : 25,
        details: `Meta description length: ${description.length} characters. Exact keyword uses in meta: ${keywordInMetaCount}.`,
        recommendation:
          keywordInMetaCount === 0
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
            : keywordInMetaCount > 1
              ? 45
              : /(,\s*\w+\s*,\s*\w+)/i.test(description)
                ? 65
                : 88,
        details: `Keyword repetition in meta: ${keywordInMetaCount}. Description: "${description || "Missing description"}".`,
        recommendation:
          keywordInMetaCount > 1
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
        details: `Detected ${h1Count} H1 tags. Current H1: "${h1Text || "Missing H1"}". Target keyword present in H1: ${h1ContainsKeyword}.`,
        recommendation:
          h1Count === 1 && h1ContainsKeyword
            ? "Maintain one clear H1 aligned with title intent."
            : "Use exactly one H1 that reflects your target keyword and page purpose.",
      },
      "h2-keyword": {
        key: "h2-keyword",
        score: h2WithKeywordCount > 0 ? 88 : h2Count > 0 ? 48 : 35,
        details: `H2 headings found: ${h2Count}. H2 headings containing target keyword: ${h2WithKeywordCount}.`,
        recommendation:
          h2WithKeywordCount > 0
            ? "Keep at least one meaningful H2 aligned with the target keyword."
            : "Include the target keyword naturally in at least one H2 heading.",
      },
      "heading-hierarchy": {
        key: "heading-hierarchy",
        score:
          h2Count > 0 && (h3Count === 0 || h2Count >= Math.floor(h3Count / 2)) && footerH2Count === 0 ? 84 : 55,
        details: `Heading counts: H2=${h2Count}, H3=${h3Count}, footer H2=${footerH2Count}.`,
        recommendation:
          "Map sections to clear H2 anchors, use H3 as true subsections, and avoid H2 usage in footer utility blocks.",
      },
      "keyword-usage": {
        key: "keyword-usage",
        score: keywordCount >= 2 && keywordDensity < 1.5 && wordCount >= 700 ? 85 : 55,
        details: `Word count: ${wordCount}. Exact keyword occurrences: ${keywordCount}. Density: ${keywordDensity.toFixed(2)}%.`,
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
        score: canonical ? 88 : 35,
        details: canonical
          ? `Canonical points to: ${canonical}`
          : "No canonical tag detected.",
        recommendation:
          canonical
            ? "Confirm canonical URL matches your preferred indexable URL."
            : "Add a canonical tag to prevent duplicate indexing issues.",
      },
      "canonical-consistency": {
        key: "canonical-consistency",
        score:
          !canonicalUrl
            ? 35
            : canonicalUrl.origin !== origin
              ? 42
              : canonicalNormalized === targetUrlNormalized
                ? 92
                : canonicalUrl.pathname === "/"
                  ? 80
                  : 62,
        details: canonicalUrl
          ? `Canonical normalized: ${canonicalNormalized}. Audited URL normalized: ${targetUrlNormalized}.`
          : "Canonical URL is missing or invalid.",
        recommendation:
          canonicalUrl && canonicalUrl.origin === origin
            ? "Keep canonical host consistent and ensure each page canonicals to the preferred live URL."
            : "Set a valid same-domain canonical URL and avoid cross-domain canonicals unless intentional.",
      },
      hreflang: {
        key: "hreflang",
        score: hreflangTags.length === 0 ? 60 : hasXDefault ? 85 : 65,
        details: `Hreflang tags found: ${hreflangTags.length}. x-default present: ${hasXDefault}.`,
        recommendation:
          "Ensure x-default points to your canonical default page and locale URLs are in sitemap.",
      },
      "hreflang-consistency": {
        key: "hreflang-consistency",
        score:
          hreflangTags.length === 0
            ? 55
            : hasXDefault && xDefaultPointsToRoot
              ? 90
              : hasXDefault
                ? 62
                : 48,
        details: `x-default href: ${xDefaultHref?.toString() ?? "missing"}. Points to root/canonical: ${xDefaultPointsToRoot}. Localized URLs in sitemap: ${sitemapLocaleCount}.`,
        recommendation:
          hasXDefault && xDefaultPointsToRoot
            ? "Keep x-default aligned to your canonical homepage and maintain locale sitemap parity."
            : "Point x-default to canonical root and verify all locale alternates exist in the sitemap.",
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
            ? `Reachable sitemaps: ${reachableRootSitemaps.length}. URLs listed: ${sitemapLocs.length}. Homepage included: ${sitemapHasHome}. Submitted page in sitemap: ${submittedPageInSitemap}.`
            : "No reachable sitemap detected from /sitemap.xml or robots-declared sitemap URLs.",
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
        details: `Sitemap URLs: ${sitemapLocs.length}. Blog/article URLs detected: ${sitemapBlogArticleCount}. Locale root URLs detected: ${sitemapLocaleCount}.`,
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
          ? `robots.txt detected. Sitemap declared: ${robotsDeclaresSitemap}. Sitemap URLs in robots: ${robotsSitemapUrls.length}. Googlebot broadly allowed: ${robotsAllowsGoogle}.`
          : "robots.txt not detected.",
        recommendation:
          "Declare explicit sitemap URL(s) in robots.txt and avoid blocking key public pages unintentionally.",
      },
      "robots-ai-policy": {
        key: "robots-ai-policy",
        score: !robotsText ? 45 : aiBotBlocked ? 75 : 60,
        details: robotsText
          ? `AI crawler directives detected: ${aiBotBlocked}.`
          : "robots.txt missing, AI crawler policy cannot be verified.",
        recommendation:
          "Define an explicit AI crawler policy in robots.txt based on your content licensing and discoverability goals.",
      },
      "social-tags": {
        key: "social-tags",
        score:
          ogTitle.length > 0 && ogDescription.length > 0 && ogImage.length > 0
            ? 85
            : 55,
        details: `OG title: ${Boolean(ogTitle)}, OG description: ${Boolean(ogDescription)}, OG image: ${Boolean(ogImage)}.`,
        recommendation:
          "Set Open Graph and X card tags for stronger link previews.",
      },
      "twitter-card-coverage": {
        key: "twitter-card-coverage",
        score:
          twitterCard.length > 0 && twitterTitle.length > 0 && twitterDescription.length > 0 && twitterImage.length > 0
            ? 86
            : twitterCard.length > 0
              ? 62
              : 45,
        details: `twitter:card=${twitterCard || "missing"}, title=${Boolean(twitterTitle)}, description=${Boolean(
          twitterDescription,
        )}, image=${Boolean(twitterImage)}.`,
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
      "internal-linking": {
        key: "internal-linking",
        score: internalLinks >= 5 ? 85 : internalLinks >= 2 ? 65 : 45,
        details: `Internal links detected: ${internalLinks}.`,
        recommendation:
          "Add contextual internal links between key sections and supporting pages.",
      },
      "internal-link-quality": {
        key: "internal-link-quality",
        score:
          nonFragmentInternalLinks.length >= 3 && keywordAnchorMatches >= 1
            ? 84
            : nonFragmentInternalLinks.length >= 1
              ? 62
              : 42,
        details: `Non-fragment internal links: ${nonFragmentInternalLinks.length}. Keyword-relevant anchor links: ${keywordAnchorMatches}.`,
        recommendation:
          "Add links to supporting pages/posts with descriptive keyword-relevant anchor text.",
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
        }, review platform link: ${hasReviewPlatformLink}.`,
        recommendation:
          hasTestimonials && (hasAboutPageLink || hasAboutPageContent)
            ? "E-E-A-T baseline is present. Strengthen it further with richer proof points (named outcomes, expert profiles, and third-party validation)."
            : "Add clearer trust signals only where missing: testimonials/case studies, visible team/about details, and expert credibility cues.",
      },
      "author-credibility": {
        key: "author-credibility",
        score: hasNamedAuthor || hasAuthorBioSignals ? 84 : hasAboutPageLink || hasAboutPageContent ? 68 : 40,
        details: `Named author/team signal detected: ${hasNamedAuthor || hasAuthorBioSignals}. About page linked: ${hasAboutPageLink}. Reachable about page content: ${hasAboutPageContent}.`,
        recommendation:
          hasNamedAuthor || hasAuthorBioSignals
            ? "Maintain visible expert attribution and keep author/team credentials up to date."
            : "Add named experts/authors with profile details and stronger team transparency.",
      },
      "backlink-footprint": {
        key: "backlink-footprint",
        score: hasReviewPlatformLink ? 75 : 48,
        details: `Review/authority platform links detected on page: ${hasReviewPlatformLink}.`,
        recommendation:
          "Strengthen authority with review-platform profiles and backlink outreach from relevant industry sources.",
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
    };

    const effectivePriorityByKey: Record<string, "critical" | "high" | "medium" | "low"> = {
      pagespeed: (checksByKey.pagespeed?.score ?? 58) >= 60 ? "medium" : "high",
      "title-tag": title.toLowerCase().includes(normalizedKeyword) ? "high" : "critical",
      "h1-count": h1ContainsKeyword ? "high" : "critical",
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
