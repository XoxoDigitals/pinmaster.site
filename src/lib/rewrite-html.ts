import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { isContentImageUrl } from "./extract";

export type ImageBlock = { src: string; html: string };

function marker(index: number): string {
  return `<!--CONTENT_IMAGE_${index}-->`;
}

function collectBlocks(html: string): ImageBlock[] {
  const $ = cheerio.load(`<div id="__img-root">${html || ""}</div>`, { xml: false });
  const $root = $("#__img-root");
  const blocks: ImageBlock[] = [];
  const seen = new Set<string>();

  const push = (src: string, blockHtml: string) => {
    if (!src || seen.has(src)) return;
    seen.add(src);
    blocks.push({ src, html: blockHtml });
  };

  $root.find("figure").each((_, el) => {
    const $el = $(el);
    const src = $el.find("img").attr("src") || $el.find("a[href]").attr("href") || "";
    push(src, $.html(el) || "");
    $el.remove();
  });

  $root.find("picture").each((_, el) => {
    const src = $(el).find("img").attr("src") || "";
    push(src, $.html(el) || "");
    $(el).remove();
  });

  $root.find("img").each((_, el) => {
    const src = $(el).attr("src") || "";
    push(src, $.html(el) || "");
  });

  $root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href && isContentImageUrl(href)) {
      const inner = $(el).find("img").length
        ? $.html(el) || ""
        : `<a href="${href}"><img src="${href}" alt="" loading="lazy" /></a>`;
      push(href, inner);
    }
  });

  return blocks;
}

/** Replace original images with numbered HTML comments so the LLM keeps slots. */
export function prepareContentForRewrite(html: string): { markedHtml: string; blocks: ImageBlock[] } {
  const $ = cheerio.load(`<div id="__img-root">${html || ""}</div>`, { xml: false });
  const $root = $("#__img-root");
  const blocks: ImageBlock[] = [];
  const seen = new Set<string>();

  const replace = (el: Element, src: string) => {
    if (!src || seen.has(src)) {
      $(el).remove();
      return;
    }
    seen.add(src);
    const index = blocks.length;
    blocks.push({ src, html: $.html(el) || "" });
    $(el).replaceWith(marker(index));
  };

  $root.find("figure").each((_, el) => {
    const src = $(el).find("img").attr("src") || $(el).find("a[href]").attr("href") || "";
    replace(el, src);
  });
  $root.find("picture").each((_, el) => {
    replace(el, $(el).find("img").attr("src") || "");
  });
  $root.find("img").each((_, el) => {
    replace(el, $(el).attr("src") || "");
  });
  $root.find("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href && isContentImageUrl(href) && !$(el).find("img").length) {
      replace(el, href);
    }
  });

  return { markedHtml: ($root.html() || "").trim(), blocks };
}

export function restoreImageMarkers(html: string, blocks: ImageBlock[]): string {
  let out = html || "";
  blocks.forEach((block, index) => {
    const token = marker(index);
    if (out.includes(token)) {
      out = out.split(token).join(block.html);
    }
  });
  return out;
}

/** If rewritten HTML dropped original images, inject the missing figures. */
export function mergeOriginalImages(originalHtml: string, rewrittenHtml: string): string {
  const originalBlocks = collectBlocks(originalHtml);
  if (!originalBlocks.length) return rewrittenHtml || "";
  const rewritten = (rewrittenHtml || "").trim();
  if (!rewritten) {
    return originalBlocks.map((b) => b.html).join("\n");
  }
  const missing = originalBlocks.filter((block) => !rewritten.includes(block.src));
  if (!missing.length) return rewritten;
  return `${rewritten}\n${missing.map((b) => b.html).join("\n")}`;
}

export function finalizeRewrittenHtml(
  originalHtml: string,
  blocks: ImageBlock[],
  rewrittenHtml: string
): string {
  return mergeOriginalImages(originalHtml, restoreImageMarkers(rewrittenHtml, blocks));
}
