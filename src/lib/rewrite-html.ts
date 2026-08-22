import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { isContentImageUrl } from "./extract";

export type ImageBlock = { src: string; html: string };

export type FinalizeRewriteOptions = {
  extraSrcs?: string[];
  baseUrl?: string;
};

function marker(index: number): string {
  return `<!--CONTENT_IMAGE_${index}-->`;
}

function loadFragment(html: string): cheerio.CheerioAPI {
  return cheerio.load(html || "", { xml: false }, false);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function absolutizeUrl(src: string, baseUrl?: string): string {
  const trimmed = decodeEntities((src || "").trim());
  if (!trimmed || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return "";
  try {
    const url = new URL(trimmed, baseUrl || "https://placeholder.local");
    if (url.protocol === "http:") url.protocol = "https:";
    if (!/^https?:$/i.test(url.protocol) && !trimmed.startsWith("//")) {
      return trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
    }
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    if (baseUrl || url.hostname !== "placeholder.local") return url.href;
    return trimmed;
  } catch {
    if (trimmed.startsWith("//")) return `https:${trimmed}`;
    return trimmed;
  }
}

function normalizeSrc(src: string, baseUrl?: string): string {
  const abs = absolutizeUrl(src, baseUrl);
  if (!abs) return "";
  try {
    const url = new URL(abs);
    url.hash = "";
    return url.href;
  } catch {
    return abs;
  }
}

function srcFromSrcset(srcset: string | undefined, baseUrl?: string): string {
  if (!srcset?.trim()) return "";
  const first = srcset.split(",")[0]?.trim().split(/\s+/)[0] || "";
  return normalizeSrc(first, baseUrl);
}

function pickNodeSrc($: cheerio.CheerioAPI, el: Element, baseUrl?: string): string {
  const $el = $(el);
  const tag = (el.tagName || "").toLowerCase();
  const candidates = [
    $el.attr("src"),
    $el.attr("data-src"),
    $el.attr("data-lazy-src"),
    $el.attr("data-original"),
    $el.attr("data-lazy"),
    $el.attr("data-bg"),
    $el.attr("data-background"),
    $el.attr("data-background-image"),
    tag === "a" ? $el.attr("href") : undefined,
  ];
  for (const c of candidates) {
    const src = normalizeSrc(c || "", baseUrl);
    if (src && !src.startsWith("data:")) return src;
  }
  return (
    srcFromSrcset($el.attr("srcset") || $el.attr("data-srcset") || $el.attr("data-lazy-srcset"), baseUrl) ||
    ""
  );
}

function figureHtml(src: string, alt = ""): string {
  const abs = src.startsWith("http") ? src : absolutizeUrl(src);
  if (!abs.startsWith("http")) return "";
  const safeAlt = escapeAttr(alt);
  return `<figure><img src="${escapeAttr(abs)}" alt="${safeAlt}" loading="lazy" /></figure>`;
}

function blockFromSrc(src: string, baseUrl?: string, html?: string): ImageBlock | null {
  const abs = normalizeSrc(src, baseUrl);
  if (!abs || !abs.startsWith("http") || abs.startsWith("data:")) return null;
  return { src: abs, html: html && /<img\b/i.test(html) ? html : figureHtml(abs) };
}

function collectBlocksFromDom(html: string, baseUrl?: string): ImageBlock[] {
  const $ = loadFragment(html);
  const blocks: ImageBlock[] = [];
  const seen = new Set<string>();

  const pushEl = (el: Element) => {
    const $el = $(el);
    let src = pickNodeSrc($, el, baseUrl);
    if (!src) {
      const img = $el.find("img").get(0) as Element | undefined;
      if (img) src = pickNodeSrc($, img, baseUrl);
      if (!src) src = normalizeSrc($el.find("a[href]").attr("href") || "", baseUrl);
    }
    const block = blockFromSrc(src, baseUrl, $.html(el) || undefined);
    if (!block || seen.has(block.src)) return;
    seen.add(block.src);
    if (block.html && !/<img\b/i.test(block.html)) {
      block.html = figureHtml(block.src);
    } else if (block.html) {
      const $wrap = loadFragment(block.html);
      $wrap("img").each((_, img) => {
        const abs = pickNodeSrc($wrap, img as Element, baseUrl);
        if (abs) $wrap(img).attr("src", abs);
      });
      block.html = $wrap.html() || figureHtml(block.src);
    }
    blocks.push(block);
  };

  $("figure").each((_, el) => {
    pushEl(el as Element);
    $(el).remove();
  });
  $("picture").each((_, el) => {
    pushEl(el as Element);
    $(el).remove();
  });
  $("img").each((_, el) => pushEl(el as Element));
  $("a[href]").each((_, el) => {
    const href = normalizeSrc($(el).attr("href") || "", baseUrl);
    if (href && isContentImageUrl(href)) pushEl(el as Element);
  });

  return blocks;
}

function collectBlocksFromRegex(html: string, baseUrl?: string): ImageBlock[] {
  const blocks: ImageBlock[] = [];
  const seen = new Set<string>();
  const re = /<figure\b[\s\S]*?<\/figure>|<picture\b[\s\S]*?<\/picture>|<img\b[^>]*>/gi;
  const raw = html || "";
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const chunk = match[0];
    const srcMatch =
      chunk.match(/\s(?:src|data-src|data-lazy-src|data-original)\s*=\s*["']([^"']+)["']/i) ||
      chunk.match(/\ssrcset\s*=\s*["']([^"']+)["']/i);
    const src = srcMatch ? normalizeSrc(srcMatch[1].split(",")[0].trim().split(/\s+/)[0], baseUrl) : "";
    const block = blockFromSrc(src, baseUrl, chunk.includes("<img") ? chunk : figureHtml(src));
    if (!block || seen.has(block.src)) continue;
    seen.add(block.src);
    blocks.push(block);
  }
  return blocks;
}

export function collectImageBlocks(
  html: string,
  extraSrcs: string[] = [],
  baseUrl?: string
): ImageBlock[] {
  const fromDom = collectBlocksFromDom(html, baseUrl);
  const fromRegex = collectBlocksFromRegex(html, baseUrl);
  const merged: ImageBlock[] = [];
  const seen = new Set<string>();
  for (const block of [...fromDom, ...fromRegex]) {
    if (!block.src || seen.has(block.src)) continue;
    seen.add(block.src);
    merged.push(block);
  }
  for (const src of extraSrcs) {
    const block = blockFromSrc(src, baseUrl);
    if (!block || seen.has(block.src)) continue;
    seen.add(block.src);
    merged.push(block);
  }
  return merged;
}

function collectPresentSrcs(html: string, baseUrl?: string): Set<string> {
  const present = new Set<string>();
  const $ = loadFragment(html);
  $("img").each((_, el) => {
    const src = pickNodeSrc($, el as Element, baseUrl);
    if (src) present.add(src);
  });
  $("source").each((_, el) => {
    const src =
      pickNodeSrc($, el as Element, baseUrl) || srcFromSrcset($(el).attr("srcset"), baseUrl);
    if (src) present.add(src);
  });
  return present;
}

function markdownImagesToHtml(html: string, baseUrl?: string): string {
  return html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, url: string) => {
    const src = normalizeSrc(url, baseUrl);
    return src ? figureHtml(src, alt) : "";
  });
}

function unescapeIfNeeded(html: string): string {
  const trimmed = (html || "").trim();
  if (!trimmed) return "";
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  if (/&lt;(?:p|h[1-6]|div|img|figure|ul|ol)\b/i.test(trimmed)) {
    return decodeEntities(trimmed);
  }
  return trimmed;
}

export function coerceRewriteHtml(raw: unknown): string {
  if (typeof raw === "string") {
    let html = raw.trim();
    const fenced = html.match(/^```(?:html)?\s*([\s\S]*?)```$/i);
    if (fenced) html = fenced[1].trim();
    return unescapeIfNeeded(html);
  }
  if (Array.isArray(raw)) {
    return raw.map((part) => coerceRewriteHtml(part)).filter(Boolean).join("\n");
  }
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    return coerceRewriteHtml(
      obj.html ?? obj.body ?? obj.content ?? obj.article ?? obj.rewritten_html
    );
  }
  return "";
}

/** Replace original images with numbered HTML comments so the LLM keeps slots. */
export function prepareContentForRewrite(
  html: string,
  baseUrl?: string
): { markedHtml: string; blocks: ImageBlock[] } {
  const $ = loadFragment(html);
  const blocks: ImageBlock[] = [];
  const seen = new Set<string>();

  const replace = (el: Element) => {
    const src =
      pickNodeSrc($, el, baseUrl) ||
      normalizeSrc($(el).find("img").attr("src") || $(el).find("a[href]").attr("href") || "", baseUrl);
    if (!src || seen.has(src)) {
      $(el).remove();
      return;
    }
    seen.add(src);
    const index = blocks.length;
    let blockHtml = $.html(el) || figureHtml(src);
    if (!/<img\b/i.test(blockHtml)) blockHtml = figureHtml(src);
    blocks.push({ src, html: blockHtml });
    $(el).replaceWith(marker(index));
  };

  $("figure").each((_, el) => replace(el as Element));
  $("picture").each((_, el) => replace(el as Element));
  $("img").each((_, el) => replace(el as Element));
  $("a[href]").each((_, el) => {
    const href = normalizeSrc($(el).attr("href") || "", baseUrl);
    if (href && isContentImageUrl(href) && !$(el).find("img").length) replace(el as Element);
  });

  if (!blocks.length) {
    const fallback = collectImageBlocks(html, [], baseUrl);
    if (fallback.length) {
      const prefix = fallback.map((_, index) => marker(index)).join("\n");
      return { markedHtml: `${prefix}\n${($.html() || html || "").trim()}`, blocks: fallback };
    }
  }

  return { markedHtml: ($.html() || "").trim(), blocks };
}

export function restoreImageMarkers(html: string, blocks: ImageBlock[]): string {
  let out = html || "";
  out = out.replace(
    /(?:<!--|&lt;!--)\s*CONTENT_IMAGE_(\d+)\s*(?:-->|--&gt;)/gi,
    (_, n: string) => {
      const block = blocks[Number(n)];
      return block?.html || "";
    }
  );
  out = out.replace(/\[CONTENT_IMAGE_(\d+)\]/gi, (_, n: string) => {
    const block = blocks[Number(n)];
    return block?.html || "";
  });
  blocks.forEach((block, index) => {
    const token = marker(index);
    if (out.includes(token)) out = out.split(token).join(block.html);
  });
  return out;
}

function insertAfterNode($: cheerio.CheerioAPI, el: Element, html: string) {
  $(el).after(html);
}

function distributeBlocks(rewritten: string, missing: ImageBlock[]): string {
  if (!missing.length) return rewritten;
  const $ = loadFragment(rewritten);
  const anchors = $("h2, h3, p").toArray() as Element[];
  if (anchors.length <= 1) {
    return `${rewritten}\n${missing.map((b) => b.html).join("\n")}`;
  }
  const step = Math.max(1, Math.floor(anchors.length / (missing.length + 1)));
  missing.forEach((block, i) => {
    const idx = Math.min(anchors.length - 1, (i + 1) * step);
    insertAfterNode($, anchors[idx], block.html);
  });
  return ($.html() || rewritten).trim();
}

/**
 * Guarantee every original content/featured image appears as a real <img> in rewritten HTML.
 * Featured/first image is placed at the top; remaining missing images are interleaved.
 */
export function mergeOriginalImages(
  originalHtml: string,
  rewrittenHtml: string,
  extraSrcs: string[] = [],
  baseUrl?: string
): string {
  const originalBlocks = collectImageBlocks(originalHtml, extraSrcs, baseUrl);
  const rewritten = markdownImagesToHtml(unescapeIfNeeded(rewrittenHtml || ""), baseUrl).trim();

  if (!originalBlocks.length) return rewritten;

  if (!rewritten) {
    return originalBlocks.map((b) => b.html).join("\n");
  }

  const present = collectPresentSrcs(rewritten, baseUrl);
  const missing = originalBlocks.filter((block) => !present.has(block.src));
  if (!missing.length) return rewritten;

  const featured = originalBlocks[0];
  let body = rewritten;
  let rest = missing;
  if (featured && missing.some((b) => b.src === featured.src)) {
    body = `${featured.html}\n${body}`;
    rest = missing.filter((b) => b.src !== featured.src);
  }

  return distributeBlocks(body, rest);
}

export function finalizeRewrittenHtml(
  originalHtml: string,
  blocks: ImageBlock[],
  rewrittenHtml: string,
  options: FinalizeRewriteOptions = {}
): string {
  const coerced = coerceRewriteHtml(rewrittenHtml);
  const restored = restoreImageMarkers(coerced, blocks);
  const extra = [...(options.extraSrcs || []), ...blocks.map((b) => b.src)];
  return mergeOriginalImages(originalHtml, restored, extra, options.baseUrl);
}
