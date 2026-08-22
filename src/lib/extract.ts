import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { humanizeSlug } from "./keyword-board";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

/** Content tags preserved in stored article HTML. */
const KEEP_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "picture",
  "pre",
  "q",
  "s",
  "section",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const KEEP_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "rel", "target"]),
  img: new Set(["src", "srcset", "sizes", "alt", "title", "width", "height", "loading"]),
  source: new Set(["src", "srcset", "sizes", "type", "media"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  col: new Set(["span"]),
  colgroup: new Set(["span"]),
};

const GLOBAL_ATTRS = new Set(["id", "class"]);

const JUNK_SELECTORS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "button",
  "input",
  "select",
  "textarea",
  "nav",
  "footer",
  "aside",
  "header",
  ".ads",
  ".ad",
  ".advertisement",
  ".advert",
  ".sponsored",
  ".social-share",
  ".share-buttons",
  ".related-posts",
  ".sidebar",
  "[role='navigation']",
  "[role='complementary']",
].join(", ");

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ContentOpsBot/2.0";

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.text();
}

function pickXmlString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (value && typeof value === "object" && "loc" in (value as object)) {
    return pickXmlString((value as { loc?: unknown }).loc);
  }
  if (value && typeof value === "object" && "#text" in (value as object)) {
    return pickXmlString((value as { "#text"?: unknown })["#text"]);
  }
  return null;
}

export async function parseSitemapEntries(sitemapUrl: string): Promise<SitemapEntry[]> {
  const xml = await fetchText(sitemapUrl);
  const data = parser.parse(xml);
  const entries: SitemapEntry[] = [];

  const indexSitemaps = asArray(data.sitemapindex?.sitemap);
  if (indexSitemaps.length) {
    for (const entry of indexSitemaps) {
      const loc = typeof entry === "string" ? entry : entry.loc;
      if (loc) {
        const nested = await parseSitemapEntries(loc);
        entries.push(...nested);
      }
    }
    return dedupeSitemapEntries(entries);
  }

  const urlEntries = asArray(data.urlset?.url);
  for (const entry of urlEntries) {
    const loc = typeof entry === "string" ? entry : pickXmlString(entry?.loc);
    if (!loc) continue;
    const newsTitle = pickXmlString(entry?.["news:news"]?.["news:title"]);
    const imageNodes = asArray(entry?.["image:image"] || entry?.image);
    const images: string[] = [];
    let imageTitle: string | null = null;
    for (const img of imageNodes) {
      const imageLoc = pickXmlString(img?.["image:loc"] || img?.loc);
      if (imageLoc) images.push(imageLoc);
      if (!imageTitle) imageTitle = pickXmlString(img?.["image:title"] || img?.title);
    }
    entries.push({
      loc,
      title: newsTitle || imageTitle,
      images: [...new Set(images)],
    });
  }

  const items = asArray(data.rss?.channel?.item);
  for (const item of items) {
    const loc = pickXmlString(item?.link);
    if (!loc) continue;
    const enclosure = item?.enclosure;
    const enclosureUrl =
      typeof enclosure === "object" ? pickXmlString(enclosure?.url) : null;
    entries.push({
      loc,
      title: pickXmlString(item?.title),
      images: enclosureUrl && isContentImageUrl(enclosureUrl) ? [enclosureUrl] : [],
    });
  }

  return dedupeSitemapEntries(entries);
}

function dedupeSitemapEntries(entries: SitemapEntry[]): SitemapEntry[] {
  const seen = new Set<string>();
  const out: SitemapEntry[] = [];
  for (const entry of entries) {
    if (seen.has(entry.loc)) continue;
    seen.add(entry.loc);
    out.push(entry);
  }
  return out;
}

export async function parseSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const listed = await parseSitemapEntries(sitemapUrl);
  return listed.map((e) => e.loc);
}

export type SitemapEntry = {
  loc: string;
  title: string | null;
  images: string[];
};

export type ExtractedArticle = {
  title: string;
  content: string;
  metaDescription: string;
  headings: string[];
  images: string[];
  tags: string[];
  featuredImage: string | null;
  imageCount: number;
};

const IMAGE_EXT_RE = /\.(avif|bmp|gif|jpe?g|png|svg|webp|tiff?)(\?|#|$)/i;
const SKIP_IMAGE_RE =
  /\b(sprite|icon|logo|avatar|pixel|tracking|1x1|spacer|badge|emoji|gravatar|favicon|smiley|wp-includes\/images)\b/i;
const CONTENT_ROOT_SELECTORS = [
  "article",
  "[itemprop='articleBody']",
  ".entry-content",
  ".post-content",
  ".post-body",
  ".td-post-content",
  ".article-content",
  ".elementor-widget-theme-post-content",
  "main",
  "[role='main']",
].join(", ");

const LAZY_ATTRS = [
  "data-src",
  "data-lazy-src",
  "data-original",
  "data-lazy",
  "data-url",
  "data-image",
  "data-img",
  "data-hi-res-src",
  "data-large-file",
  "data-bg",
  "data-background",
  "data-background-image",
] as const;

export function isContentImageUrl(url: string): boolean {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return false;
  if (SKIP_IMAGE_RE.test(url)) return false;
  if (IMAGE_EXT_RE.test(url)) return true;
  if (/wp-content\/uploads/i.test(url)) return true;
  if (/\/(media|images|photos|uploads|cdn)\//i.test(url)) return true;
  if (/shortpixel|cloudinary|imgix|cdn\.shopify|pinimg/i.test(url)) return true;
  return false;
}

export function countHtmlImages(html: string | null | undefined): number {
  if (!html) return 0;
  return (html.match(/<img\b/gi) || []).length;
}

/** True when stored extract looks too sparse and should be re-fetched before rewrite. */
export function shouldRefreshArticleImages(
  originalContent: string | null | undefined,
  originalMeta: Record<string, unknown> | null | undefined
): boolean {
  const contentCount = countHtmlImages(originalContent);
  const meta = originalMeta || {};
  const metaImages = Array.isArray(meta.images)
    ? meta.images.filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    : [];
  const sitemapImages = Array.isArray(meta.sitemapImages)
    ? meta.sitemapImages.filter((u): u is string => typeof u === "string" && u.startsWith("http"))
    : [];
  const metaCount =
    typeof meta.imageCount === "number" && meta.imageCount >= 0
      ? meta.imageCount
      : metaImages.length;

  if (!originalContent?.trim()) return true;
  if (contentCount < 2) return true;
  if (metaCount === 0 && contentCount < 3) return true;
  if (metaCount >= 2 && contentCount < metaCount) return true;
  if (sitemapImages.length >= 2 && contentCount < Math.min(sitemapImages.length, 3)) return true;
  return false;
}

function resolveUrl(baseUrl: string, maybeRelative: string | undefined | null): string | null {
  if (!maybeRelative) return null;
  let trimmed = maybeRelative.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed) return null;
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed;
  if (trimmed.startsWith("//")) trimmed = `https:${trimmed}`;
  try {
    const url = new URL(trimmed, baseUrl);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.href;
  } catch {
    return null;
  }
}

function normalizeImageKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    // Drop common cache-busters but keep path distinctness.
    u.searchParams.delete("w");
    u.searchParams.delete("h");
    u.searchParams.delete("width");
    u.searchParams.delete("height");
    return u.href;
  } catch {
    return url.split("#")[0];
  }
}

function isPlaceholderSrc(url: string | null | undefined): boolean {
  if (!url) return true;
  if (url.startsWith("data:") || url.startsWith("blob:")) return true;
  if (/\/(spacer|pixel|blank|placeholder|1x1|grey|gray|transparent)\b/i.test(url)) return true;
  if (/data:image\/svg\+xml/i.test(url)) return true;
  return false;
}

function isTinyByDims(width?: string | null, height?: string | null): boolean {
  const w = width ? parseInt(width, 10) : NaN;
  const h = height ? parseInt(height, 10) : NaN;
  if (Number.isFinite(w) && w > 0 && w < 50) return true;
  if (Number.isFinite(h) && h > 0 && h < 50) return true;
  return false;
}

/** Resolve each URL in a srcset value against the page URL. */
function absolutizeSrcset(baseUrl: string, srcset: string | undefined): string | undefined {
  if (!srcset?.trim()) return undefined;
  const parts = srcset
    .split(",")
    .map((chunk) => {
      const trimmed = chunk.trim();
      if (!trimmed) return "";
      const [urlPart, ...rest] = trimmed.split(/\s+/);
      const abs = resolveUrl(baseUrl, urlPart);
      if (!abs || isPlaceholderSrc(abs)) return "";
      return rest.length ? `${abs} ${rest.join(" ")}` : abs;
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** Prefer largest candidate from srcset (w / x descriptors). */
function pickBestFromSrcset(srcset: string | undefined, baseUrl: string): string | null {
  if (!srcset?.trim()) return null;
  let best: { url: string; score: number } | null = null;
  for (const chunk of srcset.split(",")) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;
    const [urlPart, desc = ""] = trimmed.split(/\s+/);
    const abs = resolveUrl(baseUrl, urlPart);
    if (!abs || isPlaceholderSrc(abs)) continue;
    let score = 1;
    const wMatch = /^(\d+)w$/i.exec(desc);
    const xMatch = /^(\d+(?:\.\d+)?)x$/i.exec(desc);
    if (wMatch) score = parseInt(wMatch[1], 10);
    else if (xMatch) score = Math.round(parseFloat(xMatch[1]) * 10000);
    if (!best || score >= best.score) best = { url: abs, score };
  }
  return best?.url || null;
}

function pickBestImgSrc($: cheerio.CheerioAPI, el: Element, baseUrl: string): string | null {
  const $el = $(el);
  if (isTinyByDims($el.attr("width"), $el.attr("height"))) return null;

  const lazyCandidates = LAZY_ATTRS.map((attr) => $el.attr(attr));
  const srcset =
    $el.attr("data-lazy-srcset") ||
    $el.attr("data-srcset") ||
    $el.attr("srcset");
  const fromSrcset = pickBestFromSrcset(srcset, baseUrl);
  const src = $el.attr("src");

  // Prefer explicit lazy/hi-res attrs and largest srcset over placeholder src.
  const ordered = [
    ...lazyCandidates,
    fromSrcset,
    !isPlaceholderSrc(src || "") ? src : null,
  ];

  for (const c of ordered) {
    const abs = typeof c === "string" ? resolveUrl(baseUrl, c) : c;
    if (!abs || isPlaceholderSrc(abs)) continue;
    if (abs.startsWith("http")) return abs;
  }

  if (fromSrcset) return fromSrcset;
  return null;
}

function backgroundUrlFromStyle(style: string | undefined, baseUrl: string): string | null {
  if (!style) return null;
  const match = style.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/i);
  const abs = resolveUrl(baseUrl, match?.[1]);
  return abs && !isPlaceholderSrc(abs) ? abs : null;
}

function isContentImageHosted(src: string): boolean {
  return Boolean(src.startsWith("http") && isContentImageUrl(src));
}

function shouldKeepImageUrl(src: string): boolean {
  if (!src.startsWith("http")) return false;
  if (isPlaceholderSrc(src)) return false;
  if (SKIP_IMAGE_RE.test(src)) return false;
  return isContentImageUrl(src) || IMAGE_EXT_RE.test(src);
}

function dedupeImageUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw || !shouldKeepImageUrl(raw)) continue;
    const key = normalizeImageKey(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

function collectImagesFromHtml(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html || "", { xml: false }, false);
  const images: string[] = [];

  const push = (src: string | null) => {
    if (src && shouldKeepImageUrl(src)) images.push(src);
  };

  // Promote noscript fallbacks so lazy themes keep real <img> markup.
  $("noscript").each((_, el) => {
    const inner = $(el).html() || "";
    if (/<img\b/i.test(inner)) $(el).replaceWith(inner);
  });

  $("img, amp-img").each((_, el) => {
    push(pickBestImgSrc($, el as Element, baseUrl));
  });

  $("picture source, source").each((_, el) => {
    const $el = $(el);
    push(
      pickBestFromSrcset($el.attr("srcset") || $el.attr("data-srcset"), baseUrl) ||
        resolveUrl(baseUrl, $el.attr("src"))
    );
  });

  $("a[href]").each((_, el) => {
    const href = resolveUrl(baseUrl, $(el).attr("href"));
    if (href && isContentImageHosted(href)) push(href);
  });

  $("[style*='url('], [data-bg], [data-background], [data-background-image]").each((_, el) => {
    const $el = $(el);
    push(
      backgroundUrlFromStyle($el.attr("style"), baseUrl) ||
        resolveUrl(baseUrl, $el.attr("data-bg") || $el.attr("data-background") || $el.attr("data-background-image"))
    );
  });

  return dedupeImageUrls(images);
}

/**
 * Strip junk chrome and non-content tags; keep formatting + images.
 * Resolves relative img src / srcset to absolute URLs.
 */
function cleanArticleHtml(rawHtml: string, baseUrl: string): string {
  const $ = cheerio.load(rawHtml || "", { xml: false }, false);

  // Keep real images hidden inside noscript (common lazy-load pattern).
  $("noscript").each((_, el) => {
    const inner = $(el).html() || "";
    if (/<img\b|<picture\b/i.test(inner)) $(el).replaceWith(inner);
    else $(el).remove();
  });

  $(JUNK_SELECTORS).remove();

  // Bottom-up so unwraps leave children already processed.
  const elements = $("*").toArray().reverse() as Element[];
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    const $el = $(el);

    if (tag === "amp-img") {
      const abs = pickBestImgSrc($, el, baseUrl);
      if (!abs) {
        $el.remove();
        continue;
      }
      $el.replaceWith(`<img src="${abs}" alt="${($el.attr("alt") || "").replace(/"/g, "&quot;")}" loading="lazy" />`);
      continue;
    }

    if (!KEEP_TAGS.has(tag)) {
      $el.replaceWith($el.contents());
      continue;
    }

    if (tag === "img") {
      const abs = pickBestImgSrc($, el, baseUrl);
      if (!abs || !shouldKeepImageUrl(abs)) {
        $el.remove();
        continue;
      }
      $el.attr("src", abs);
      const srcset = absolutizeSrcset(
        baseUrl,
        $el.attr("srcset") || $el.attr("data-srcset") || $el.attr("data-lazy-srcset")
      );
      if (srcset) $el.attr("srcset", srcset);
      else $el.removeAttr("srcset");
      if (!$el.attr("alt")) $el.attr("alt", "");
      $el.attr("loading", "lazy");
    }

    if (tag === "source") {
      const src = resolveUrl(baseUrl, $el.attr("src"));
      if (src && !isPlaceholderSrc(src)) $el.attr("src", src);
      const srcset = absolutizeSrcset(
        baseUrl,
        $el.attr("srcset") || $el.attr("data-srcset") || $el.attr("data-lazy-srcset")
      );
      if (srcset) $el.attr("srcset", srcset);
    }

    if (tag === "a") {
      const href = resolveUrl(baseUrl, $el.attr("href"));
      if (href) $el.attr("href", href);
      if (href && isContentImageHosted(href) && !$el.find("img").length) {
        $el.prepend(`<img src="${href}" alt="" loading="lazy" />`);
      }
    }

    const bg =
      backgroundUrlFromStyle($el.attr("style"), baseUrl) ||
      resolveUrl(baseUrl, $el.attr("data-bg") || $el.attr("data-background") || $el.attr("data-background-image"));
    if (bg && isContentImageHosted(bg) && !$el.find(`img[src="${bg}"]`).length && tag !== "img") {
      $el.prepend(`<img src="${bg}" alt="" loading="lazy" />`);
    }

    const allowed = KEEP_ATTRS[tag] || GLOBAL_ATTRS;
    for (const name of Object.keys({ ...el.attribs })) {
      const lower = name.toLowerCase();
      if (lower.startsWith("on") || lower === "style") {
        $el.removeAttr(name);
        continue;
      }
      if (!allowed.has(lower) && !GLOBAL_ATTRS.has(lower)) {
        $el.removeAttr(name);
      }
    }
  }

  return ($.html() || "").trim();
}

function extractFeaturedImage($: cheerio.CheerioAPI, baseUrl: string, contentImages: string[]): string | null {
  const metaCandidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
  ];

  for (const c of metaCandidates) {
    const abs = resolveUrl(baseUrl, c);
    if (abs && abs.startsWith("http") && shouldKeepImageUrl(abs)) return abs;
  }

  for (const src of contentImages) {
    if (shouldKeepImageUrl(src)) return src;
  }

  return contentImages[0] || null;
}

function htmlHasImgSrc(html: string, src: string, baseUrl?: string): boolean {
  if (!src) return false;
  const key = normalizeImageKey(src);
  const $ = cheerio.load(html || "", { xml: false }, false);
  let found = false;
  $("img").each((_, el) => {
    const s =
      pickBestImgSrc($, el as Element, baseUrl || src) ||
      $(el).attr("src") ||
      "";
    if (s && (s === src || normalizeImageKey(s) === key)) found = true;
  });
  return found;
}

function ensureFeaturedInHtml(
  html: string,
  featuredImage: string | null,
  title: string,
  baseUrl?: string
): string {
  if (!featuredImage) return html;
  if (htmlHasImgSrc(html, featuredImage, baseUrl)) return html;
  const alt = title.replace(/"/g, "&quot;");
  return `<figure class="featured"><img src="${featuredImage}" alt="${alt}" loading="lazy" /></figure>\n${html}`;
}

function pickBestContentRootHtml($page: cheerio.CheerioAPI): string {
  let bestHtml = "";
  let bestScore = -1;
  $page(CONTENT_ROOT_SELECTORS).each((_, el) => {
    const html = $page(el).html() || "";
    const score = countHtmlImages(html) * 10 + html.length;
    if (score > bestScore) {
      bestScore = score;
      bestHtml = html;
    }
  });
  if (bestHtml) return bestHtml;
  return $page("body").html() || "";
}

function collectImagesFromContentRoots($page: cheerio.CheerioAPI, baseUrl: string): string[] {
  // Use the single best content root to avoid related/sidebar duplication from nested mains.
  const best = pickBestContentRootHtml($page);
  const cloneHtml = cheerio.load(best || "", { xml: false }, false);
  cloneHtml("noscript").each((_, el) => {
    const inner = cloneHtml(el).html() || "";
    if (/<img\b/i.test(inner)) cloneHtml(el).replaceWith(inner);
  });
  cloneHtml(JUNK_SELECTORS).remove();
  cloneHtml(".related-posts, .sharedaddy, .jp-relatedposts, .wp-block-image-gallery").remove();
  return collectImagesFromHtml(cloneHtml.html() || "", baseUrl);
}

function mergeMissingImages(html: string, urls: string[]): string {
  let out = html;
  const present = new Set(
    collectImagesFromHtml(out, "https://placeholder.local").map(normalizeImageKey)
  );
  for (const src of urls) {
    if (!src || !shouldKeepImageUrl(src)) continue;
    const key = normalizeImageKey(src);
    if (present.has(key) || out.includes(src)) continue;
    present.add(key);
    out += `\n<figure><img src="${src}" alt="" loading="lazy" /></figure>`;
  }
  return out;
}

function collectStructuredDataImages(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const found: string[] = [];

  const pushMaybe = (value: unknown, depth = 0) => {
    if (depth > 6 || found.length > 40) return;
    if (typeof value === "string") {
      const abs = resolveUrl(baseUrl, value);
      if (abs && shouldKeepImageUrl(abs)) found.push(abs);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => pushMaybe(v, depth + 1));
      return;
    }
    if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if ("url" in obj) pushMaybe(obj.url, depth + 1);
      if ("contentUrl" in obj) pushMaybe(obj.contentUrl, depth + 1);
      if ("thumbnailUrl" in obj) pushMaybe(obj.thumbnailUrl, depth + 1);
      if ("image" in obj) pushMaybe(obj.image, depth + 1);
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html() || "";
    try {
      const parsed = JSON.parse(raw) as unknown;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const obj = node as Record<string, unknown>;
        const type = String(obj["@type"] || "");
        if (/Article|BlogPosting|NewsArticle|WebPage|ImageObject/i.test(type) || obj.image) {
          pushMaybe(obj.image);
          pushMaybe(obj.thumbnailUrl);
        }
      }
    } catch {
      // ignore invalid JSON-LD
    }
  });

  const nextData =
    $("#__NEXT_DATA__").html() ||
    html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (nextData) {
    try {
      const parsed = JSON.parse(nextData) as unknown;
      const walk = (node: unknown, depth: number) => {
        if (!node || depth > 8 || found.length > 40) return;
        if (typeof node === "string") {
          if (
            (IMAGE_EXT_RE.test(node) || /wp-content\/uploads/i.test(node)) &&
            node.startsWith("http")
          ) {
            pushMaybe(node);
          }
          return;
        }
        if (Array.isArray(node)) {
          node.forEach((v) => walk(v, depth + 1));
          return;
        }
        if (typeof node === "object") {
          for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            if (/^(image|images|img|thumbnail|photo|featuredImage|ogImage)$/i.test(k)) {
              pushMaybe(v);
            } else if (typeof v === "object") {
              walk(v, depth + 1);
            }
          }
        }
      };
      walk(parsed, 0);
    } catch {
      // ignore
    }
  }

  return dedupeImageUrls(found);
}

function findAlternateUrls($page: cheerio.CheerioAPI, pageUrl: string): string[] {
  const out: string[] = [];
  const amp = $page('link[rel="amphtml"]').attr("href");
  const print =
    $page('link[rel="alternate"][media*="print"]').attr("href") ||
    $page('a[href*="print=1"], a[href*="/print"]').attr("href");
  for (const cand of [amp, print]) {
    const abs = resolveUrl(pageUrl, cand);
    if (abs && abs !== pageUrl) out.push(abs);
  }
  try {
    const u = new URL(pageUrl);
    u.searchParams.set("print", "1");
    out.push(u.href);
  } catch {
    // ignore
  }
  return [...new Set(out)];
}

export function titleFromSourceUrl(url: string): string {
  const fromSlug = humanizeSlug(url);
  if (fromSlug && fromSlug !== "Untitled") return fromSlug;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export async function extractArticleContent(
  url: string,
  extras?: { extraImages?: string[] }
): Promise<ExtractedArticle> {
  let html = await fetchText(url);
  let $page = cheerio.load(html);

  // If the first paint is skeleton-like, try AMP / print variants.
  let earlyImages = collectImagesFromContentRoots($page, url);
  if (earlyImages.length < 2) {
    for (const altUrl of findAlternateUrls($page, url)) {
      try {
        const altHtml = await fetchText(altUrl);
        const altPage = cheerio.load(altHtml);
        const altImgs = collectImagesFromContentRoots(altPage, altUrl);
        if (altImgs.length > earlyImages.length) {
          html = altHtml;
          $page = altPage;
          earlyImages = altImgs;
          break;
        }
      } catch {
        // keep primary HTML
      }
    }
  }

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document, {
    keepClasses: false,
  });
  const article = reader.parse();

  const metaDescription =
    $page('meta[name="description"]').attr("content") ||
    $page('meta[property="og:description"]').attr("content") ||
    "";

  const headings: string[] = [];
  $page("h1, h2, h3").each((_, el) => {
    const text = $page(el).text().trim();
    if (text) headings.push(text);
  });

  const tags: string[] = [];
  $page('meta[property="article:tag"]').each((_, el) => {
    const t = $page(el).attr("content");
    if (t) tags.push(t);
  });
  $page('a[rel="tag"]').each((_, el) => {
    const t = $page(el).text().trim();
    if (t) tags.push(t);
  });

  const title =
    $page('meta[property="og:title"]').attr("content")?.trim() ||
    $page("h1").first().text().trim() ||
    article?.title?.trim() ||
    $page("title").text().trim() ||
    titleFromSourceUrl(url);

  const rootHtml = pickBestContentRootHtml($page);
  const readabilityHtml = article?.content || "";
  const cleanedRoot = cleanArticleHtml(rootHtml, url);
  const cleanedReadability = cleanArticleHtml(readabilityHtml, url);

  // Prefer the body with more real images; Readability alone often drops galleries.
  let content =
    countHtmlImages(cleanedRoot) >= countHtmlImages(cleanedReadability)
      ? cleanedRoot
      : cleanedReadability || cleanedRoot;

  const fromRoots = collectImagesFromContentRoots($page, url);
  const fromStructured = collectStructuredDataImages(html, url);
  const extra = (extras?.extraImages || [])
    .map((src) => resolveUrl(url, src))
    .filter((src): src is string => Boolean(src && src.startsWith("http")));

  // Merge only article-scoped extras (roots + sitemap + structured), not whole-site URLs.
  content = mergeMissingImages(content, [...fromRoots, ...fromStructured, ...extra]);

  const images = collectImagesFromHtml(content, url);
  const featuredImage = extractFeaturedImage($page, url, images);
  content = ensureFeaturedInHtml(content, featuredImage, title, url);

  const allImages = dedupeImageUrls([
    ...(featuredImage ? [featuredImage] : []),
    ...collectImagesFromHtml(content, url),
    ...fromRoots,
    ...extra,
  ]).slice(0, 80);

  // Ensure every kept URL appears as an <img> in stored HTML.
  content = mergeMissingImages(content, allImages);
  content = ensureFeaturedInHtml(content, featuredImage, title, url);

  const imageCount = countHtmlImages(content);
  console.log(
    `[extract] ${url} imageCount=${imageCount} uniqueUrls=${allImages.length} featured=${Boolean(
      featuredImage
    )}`
  );

  return {
    title,
    content,
    metaDescription,
    headings,
    images: allImages,
    tags: [...new Set(tags)].slice(0, 20),
    featuredImage,
    imageCount,
  };
}
