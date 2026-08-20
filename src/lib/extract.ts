import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

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
  "noscript",
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

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "ContentOpsBot/1.0 (+https://localhost)",
      Accept: "application/xml,text/xml,application/rss+xml,text/html,*/*",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.text();
}

export async function parseSitemapUrls(sitemapUrl: string): Promise<string[]> {
  const xml = await fetchText(sitemapUrl);
  const data = parser.parse(xml);
  const urls: string[] = [];

  const indexSitemaps = asArray(data.sitemapindex?.sitemap);
  if (indexSitemaps.length) {
    for (const entry of indexSitemaps) {
      const loc = typeof entry === "string" ? entry : entry.loc;
      if (loc) {
        const nested = await parseSitemapUrls(loc);
        urls.push(...nested);
      }
    }
    return [...new Set(urls)];
  }

  const urlEntries = asArray(data.urlset?.url);
  for (const entry of urlEntries) {
    const loc = typeof entry === "string" ? entry : entry.loc;
    if (loc) urls.push(loc);
  }

  const items = asArray(data.rss?.channel?.item);
  for (const item of items) {
    if (item?.link) urls.push(item.link);
  }

  return [...new Set(urls)];
}

export type ExtractedArticle = {
  title: string;
  content: string;
  metaDescription: string;
  headings: string[];
  images: string[];
  tags: string[];
  featuredImage: string | null;
};

function resolveUrl(baseUrl: string, maybeRelative: string | undefined | null): string | null {
  if (!maybeRelative) return null;
  const trimmed = maybeRelative.trim();
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return trimmed || null;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
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
      if (!abs) return "";
      return rest.length ? `${abs} ${rest.join(" ")}` : abs;
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

function pickBestImgSrc($: cheerio.CheerioAPI, el: Element, baseUrl: string): string | null {
  const $el = $(el);
  const candidates = [
    $el.attr("src"),
    $el.attr("data-src"),
    $el.attr("data-lazy-src"),
    $el.attr("data-original"),
  ];

  for (const c of candidates) {
    const abs = resolveUrl(baseUrl, c);
    if (abs && !abs.startsWith("data:")) return abs;
  }

  const srcset =
    $el.attr("srcset") ||
    $el.attr("data-srcset") ||
    $el.attr("data-lazy-srcset");
  if (srcset) {
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    return resolveUrl(baseUrl, first);
  }

  return null;
}

function collectImagesFromHtml(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const images: string[] = [];
  $("img").each((_, el) => {
    const src = pickBestImgSrc($, el, baseUrl);
    if (src && src.startsWith("http")) images.push(src);
  });
  return [...new Set(images)];
}

/**
 * Strip junk chrome and non-content tags; keep formatting + images.
 * Resolves relative img src / srcset to absolute URLs.
 */
function cleanArticleHtml(rawHtml: string, baseUrl: string): string {
  const $ = cheerio.load(`<div id="__article-root">${rawHtml}</div>`, { xml: false });
  const $root = $("#__article-root");

  $root.find(JUNK_SELECTORS).remove();

  // Bottom-up so unwraps leave children already processed.
  const elements = $root.find("*").toArray().reverse() as Element[];
  for (const el of elements) {
    const tag = el.tagName.toLowerCase();
    const $el = $(el);

    if (!KEEP_TAGS.has(tag)) {
      $el.replaceWith($el.contents());
      continue;
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

    if (tag === "img") {
      const abs = pickBestImgSrc($, el, baseUrl);
      if (!abs) {
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
      $el.removeAttr("data-src");
      $el.removeAttr("data-lazy-src");
      $el.removeAttr("data-original");
      $el.removeAttr("data-srcset");
      $el.removeAttr("data-lazy-srcset");
      if (!$el.attr("alt")) $el.attr("alt", "");
      $el.attr("loading", "lazy");
    }

    if (tag === "source") {
      const src = resolveUrl(baseUrl, $el.attr("src"));
      if (src) $el.attr("src", src);
      const srcset = absolutizeSrcset(baseUrl, $el.attr("srcset"));
      if (srcset) $el.attr("srcset", srcset);
    }

    if (tag === "a") {
      const href = resolveUrl(baseUrl, $el.attr("href"));
      if (href) $el.attr("href", href);
    }
  }

  return ($root.html() || "").trim();
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
    if (abs && abs.startsWith("http")) return abs;
  }

  // Prefer first reasonably large content image (skip tiny icons/tracking).
  for (const src of contentImages) {
    const lower = src.toLowerCase();
    if (/\b(sprite|icon|logo|avatar|pixel|tracking|1x1|spacer)\b/.test(lower)) continue;
    return src;
  }

  return contentImages[0] || null;
}

function ensureFeaturedInHtml(html: string, featuredImage: string | null, title: string): string {
  if (!featuredImage) return html;
  if (html.includes(featuredImage)) return html;
  const alt = title.replace(/"/g, "&quot;");
  return `<figure><img src="${featuredImage}" alt="${alt}" loading="lazy" /></figure>\n${html}`;
}

export async function extractArticleContent(url: string): Promise<ExtractedArticle> {
  const html = await fetchText(url);
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document, {
    keepClasses: false,
  });
  const article = reader.parse();

  const $page = cheerio.load(html);

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
    article?.title ||
    $page('meta[property="og:title"]').attr("content") ||
    $page("title").text().trim() ||
    "Untitled";

  // Prefer Readability HTML; fall back to article/main/body.
  const rawContent =
    article?.content ||
    $page("article").html() ||
    $page("main").html() ||
    $page('[role="main"]').html() ||
    $page("body").html() ||
    "";

  let content = cleanArticleHtml(rawContent, url);
  const images = collectImagesFromHtml(content, url);
  const featuredImage = extractFeaturedImage($page, url, images);
  content = ensureFeaturedInHtml(content, featuredImage, title);

  // Re-collect after possible featured prepend.
  const allImages = collectImagesFromHtml(content, url);
  if (featuredImage && !allImages.includes(featuredImage)) {
    allImages.unshift(featuredImage);
  }

  return {
    title,
    content,
    metaDescription,
    headings,
    images: [...new Set(allImages)].slice(0, 40),
    tags: [...new Set(tags)].slice(0, 20),
    featuredImage,
  };
}
