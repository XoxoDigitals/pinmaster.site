import * as cheerio from "cheerio";

/** Blogger post editor "Large" image width (not Original size). */
export const BLOGGER_IMAGE_LARGE_WIDTH = 640;

/** Normalize img tags so Blogger treats them as Large, not Original. */
export function prepareBloggerHtml(html: string): string {
  if (!html?.trim()) return html;
  const $ = cheerio.load(html, { xml: false }, false);

  $("img").each((_, el) => {
    const $img = $(el);
    $img.attr("width", String(BLOGGER_IMAGE_LARGE_WIDTH));
    $img.removeAttr("height");
    $img.removeAttr("data-original-width");
    $img.removeAttr("data-original-height");
    $img.removeAttr("sizes");
    $img.removeAttr("srcset");
    $img.attr("style", "max-width:100%;height:auto;");
  });

  return ($.html() || html).trim();
}
