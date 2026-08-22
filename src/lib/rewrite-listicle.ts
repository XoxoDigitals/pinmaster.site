import * as cheerio from "cheerio";

export type ListicleRewriteHint = {
  originalCount: number;
  targetMin: number;
  targetMax: number;
};

/** How many numbered sections/items the source listicle appears to have. */
export function countNumberedListItems(html: string): number {
  if (!html?.trim()) return 0;
  const $ = cheerio.load(html, { xml: false }, false);
  const numbers = new Set<number>();

  $("h1,h2,h3,h4,h5,h6").each((_, el) => {
    const text = $(el).text().trim();
    const m = text.match(/^(\d{1,2})[\.\):\-–—]\s+/);
    if (m) numbers.add(parseInt(m[1], 10));
  });

  const markdownHeadings = html.match(/#{2,6}\s+(\d{1,2})[\.\):\-–—]\s+/g) || [];
  for (const line of markdownHeadings) {
    const m = line.match(/(\d{1,2})[\.\):\-–—]/);
    if (m) numbers.add(parseInt(m[1], 10));
  }

  if (!numbers.size) return 0;
  return Math.max(numbers.size, ...numbers);
}

/** Target a smaller unique count than the source (never the same total). */
export function computeReducedListTarget(original: number): { min: number; max: number } {
  if (original < 5) return { min: original, max: original };
  const min = Math.max(5, Math.ceil(original * 0.6));
  let max = Math.floor(original * 0.85);
  if (max >= original) max = original - 1;
  if (max < min) max = min;
  return { min, max };
}

export function analyzeListicleContent(html: string): ListicleRewriteHint | null {
  const originalCount = countNumberedListItems(html);
  if (originalCount < 5) return null;
  const { min, max } = computeReducedListTarget(originalCount);
  return { originalCount, targetMin: min, targetMax: max };
}

export function listiclePromptSection(hint: ListicleRewriteHint): string {
  return `Listicle / numbered recipes: the source has about ${hint.originalCount} numbered items. Rewrite with ${hint.targetMin}–${hint.targetMax} items only — never keep all ${hint.originalCount}. Pick the strongest items, renumber from 1, and keep one image placeholder (CONTENT_IMAGE comment) per kept item. Do not mention how many were in the original.`;
}

export function buildRewriteUserContent(input: {
  url: string;
  title: string;
  content: string;
  listicle?: ListicleRewriteHint | null;
}): string {
  const parts = [
    `Source URL: ${input.url}`,
    `Original title: ${input.title}`,
  ];
  if (input.listicle) {
    parts.push(listiclePromptSection(input.listicle));
  }
  parts.push("", "Original content:", input.content.slice(0, 24000));
  return parts.join("\n");
}

/** Leading number in title (e.g. "21 Best …"). */
export function ensureNumberedTitle(
  title: string,
  opts?: { listicle?: ListicleRewriteHint | null; itemCount?: number }
): string {
  const cleaned = title.trim();
  if (/^\d{1,2}\s+\S/.test(cleaned)) return cleaned;

  let n = opts?.itemCount && opts.itemCount >= 5 ? opts.itemCount : 0;
  if (!n && opts?.listicle) {
    n = Math.round((opts.listicle.targetMin + opts.listicle.targetMax) / 2);
  }
  if (n >= 5) {
    const withoutLeadingThe = cleaned.replace(/^the\s+/i, "");
    return `${n} ${withoutLeadingThe}`;
  }
  return cleaned;
}

export function syncTitleAndH1(html: string, title: string): string {
  if (!html?.trim()) return html;
  const $ = cheerio.load(html, { xml: false }, false);
  const safe = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
  const h1 = $("h1").first();
  if (h1.length) {
    h1.text(title);
  } else {
    $.root().prepend(`<h1>${safe}</h1>\n`);
  }
  return ($.html() || html).trim();
}
