import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { isContentImageUrl, pickBestFromSrcset, imageIdentityKey } from "./extract";

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

function srcKey(src: string, baseUrl?: string): string {
  const abs = normalizeSrc(src, baseUrl);
  return abs ? imageIdentityKey(abs) : "";
}

function srcFromSrcset(srcset: string | undefined, baseUrl?: string): string {
  if (!srcset?.trim()) return "";
  const best = pickBestFromSrcset(srcset, baseUrl || "https://placeholder.local");
  return best ? normalizeSrc(best, baseUrl) : "";
}

function isPlaceholderNodeSrc(src: string): boolean {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return true;
  return /\/(spacer|pixel|blank|placeholder|1x1|grey|gray|transparent)\b/i.test(src);
}

function pickNodeSrc($: cheerio.CheerioAPI, el: Element, baseUrl?: string): string {
  const $el = $(el);
  const tag = (el.tagName || "").toLowerCase();

  if (tag === "a") {
    const img = $el.find("img").get(0) as Element | undefined;
    if (img) {
      const fromImg = pickNodeSrc($, img, baseUrl);
      if (fromImg) return fromImg;
    }
    const href = $el.attr("href") || "";
    if (href && isContentImageUrl(href)) {
      return normalizeSrc(href, baseUrl);
    }
    return "";
  }

  const lazy = [
    $el.attr("data-src"),
    $el.attr("data-lazy-src"),
    $el.attr("data-original"),
    $el.attr("data-lazy"),
    $el.attr("data-bg"),
    $el.attr("data-background"),
    $el.attr("data-background-image"),
  ];
  const fromSrcset = srcFromSrcset(
    $el.attr("data-lazy-srcset") || $el.attr("data-srcset") || $el.attr("srcset"),
    baseUrl
  );
  const src = $el.attr("src");
  const resolvedSrc = normalizeSrc(src || "", baseUrl);
  if (resolvedSrc && !isPlaceholderNodeSrc(resolvedSrc) && resolvedSrc.startsWith("http")) {
    return resolvedSrc;
  }
  const ordered = [...lazy, fromSrcset, !isPlaceholderNodeSrc(src || "") ? src : undefined];
  for (const c of ordered) {
    const normalized = normalizeSrc(c || "", baseUrl);
    if (normalized && !isPlaceholderNodeSrc(normalized)) return normalized;
  }
  return fromSrcset || "";
}

function figureBlockFromElement(
  $: cheerio.CheerioAPI,
  el: Element,
  src: string,
  featured: boolean
): string {
  const $el = $(el);
  const alt = decodeEntities($el.find("img").first().attr("alt") || "");
  let html = figureHtml(src, alt, featured);
  const figcaption = $el.find("figcaption").first();
  if (figcaption.length) {
    const capHtml = figcaption.html()?.trim();
    if (capHtml) {
      html = html.replace("</figure>", `<figcaption>${capHtml}</figcaption></figure>`);
    }
  }
  return html;
}

function figureHtml(src: string, alt = "", featured = false): string {
  const abs = src.startsWith("http") ? src : absolutizeUrl(src);
  if (!abs.startsWith("http")) return "";
  const safeAlt = escapeAttr(alt);
  const cls = featured ? ' class="featured"' : "";
  return `<figure${cls}><img src="${escapeAttr(abs)}" alt="${safeAlt}" loading="lazy" /></figure>`;
}

function blockFromSrc(src: string, baseUrl?: string, html?: string, featured = false): ImageBlock | null {
  const abs = normalizeSrc(src, baseUrl);
  if (!abs || !abs.startsWith("http") || abs.startsWith("data:")) return null;
  // Always emit a clean figure for restore/inject so After never depends on brittle original markup.
  return { src: abs, html: figureHtml(abs, "", featured) };
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
    const key = srcKey(src, baseUrl);
    if (!block || !key || seen.has(key)) return;
    seen.add(key);
    if (block.html && !/<img\b/i.test(block.html)) {
      block.html = figureHtml(block.src);
    } else {
      block.html = figureBlockFromElement($, el as Element, block.src, blocks.length === 0);
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
    let src = "";
    if (srcMatch) {
      const raw = srcMatch[1];
      src =
        /\ssrcset\s*=/i.test(srcMatch[0])
          ? srcFromSrcset(raw, baseUrl) || normalizeSrc(raw.split(",")[0].trim().split(/\s+/)[0], baseUrl)
          : normalizeSrc(raw, baseUrl);
    }
    const block = blockFromSrc(src, baseUrl, chunk.includes("<img") ? chunk : figureHtml(src));
    const key = srcKey(src, baseUrl);
    if (!block || !key || seen.has(key)) continue;
    seen.add(key);
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
    const key = srcKey(block.src, baseUrl);
    if (!block.src || !key || seen.has(key)) continue;
    seen.add(key);
    merged.push(block);
  }
  for (const src of extraSrcs) {
    const block = blockFromSrc(src, baseUrl);
    const key = srcKey(src, baseUrl);
    if (!block || !key || seen.has(key)) continue;
    seen.add(key);
    merged.push(block);
  }
  return merged;
}

function collectPresentSrcs(html: string, baseUrl?: string): Set<string> {
  const present = new Set<string>();
  const $ = loadFragment(html);
  $("img").each((_, el) => {
    const src = pickNodeSrc($, el as Element, baseUrl);
    const key = srcKey(src, baseUrl);
    if (key) present.add(key);
  });
  $("source").each((_, el) => {
    const src =
      pickNodeSrc($, el as Element, baseUrl) || srcFromSrcset($(el).attr("srcset"), baseUrl);
    const key = srcKey(src, baseUrl);
    if (key) present.add(key);
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
    const key = srcKey(src, baseUrl);
    if (!src || !key || seen.has(key)) {
      $(el).remove();
      return;
    }
    seen.add(key);
    const index = blocks.length;
    const blockHtml = figureBlockFromElement($, el, src, index === 0);
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

  if (!anchors.length) {
    const tail = missing.map((b) => b.html).join("\n");
    return `${rewritten}\n${tail}`.trim();
  }

  // First missing image goes after the first paragraph (or first anchor).
  const firstAnchor = $("p").get(0) || anchors[0];
  insertAfterNode($, firstAnchor as Element, missing[0].html);

  const rest = missing.slice(1);
  if (rest.length) {
    const laterAnchors = $("h2, h3, p").toArray() as Element[];
    if (laterAnchors.length <= 1) {
      const root = $.root();
      root.append(rest.map((b) => b.html).join("\n"));
    } else {
      const step = Math.max(1, Math.floor(laterAnchors.length / (rest.length + 1)));
      rest.forEach((block, i) => {
        const idx = Math.min(laterAnchors.length - 1, (i + 1) * step);
        insertAfterNode($, laterAnchors[idx], block.html);
      });
    }
  }

  // Append any blocks that somehow didn't land as real <img> tags.
  let out = ($.html() || rewritten).trim();
  const present = collectPresentSrcs(out);
  const stillMissing = missing.filter((b) => !present.has(srcKey(b.src)));
  if (stillMissing.length) {
    out = `${out}\n${stillMissing.map((b) => b.html).join("\n")}`;
  }
  return out.trim();
}

function stripImageBySrc(html: string, src: string, baseUrl?: string): string {
  const key = srcKey(src, baseUrl);
  if (!key) return html;
  const $ = loadFragment(html);
  $("figure, picture, img").each((_, el) => {
    const elSrc = pickNodeSrc($, el as Element, baseUrl);
    if (elSrc && srcKey(elSrc, baseUrl) === key) {
      $(el).remove();
    }
  });
  return ($.html() || html).trim();
}

/**
 * Guarantee every original content/featured image appears as a real <img> in rewritten HTML.
 * Featured/first image is always placed at the top; remaining missing images are interleaved.
 */
export function mergeOriginalImages(
  originalHtml: string,
  rewrittenHtml: string,
  extraSrcs: string[] = [],
  baseUrl?: string
): string {
  const originalBlocks = collectImageBlocks(originalHtml, extraSrcs, baseUrl).map((block, i) => ({
    ...block,
    html: figureHtml(block.src, "", i === 0),
  }));
  const rewritten = markdownImagesToHtml(unescapeIfNeeded(rewrittenHtml || ""), baseUrl).trim();

  if (!originalBlocks.length) return rewritten;

  if (!rewritten) {
    return originalBlocks.map((b) => b.html).join("\n");
  }

  const featured = originalBlocks[0];
  let body = rewritten;
  if (featured) {
    body = stripImageBySrc(body, featured.src, baseUrl);
    body = `${figureHtml(featured.src, "", true)}\n${body}`.trim();
  }

  const present = collectPresentSrcs(body, baseUrl);
  const missing = originalBlocks.filter(
    (block) => !present.has(srcKey(block.src, baseUrl))
  );
  const rest = missing.filter(
    (block) => !featured || srcKey(block.src, baseUrl) !== srcKey(featured.src, baseUrl)
  );
  if (!rest.length) return body;

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
