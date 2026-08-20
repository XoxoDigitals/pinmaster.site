/** Humanize a URL slug: banana-chocolate-chip-cookies → Banana chocolate chip cookies */
export function humanizeSlug(slugOrUrl: string): string {
  let slug = slugOrUrl.trim();
  try {
    if (/^https?:\/\//i.test(slug)) {
      const path = new URL(slug).pathname.replace(/\/+$/, "");
      slug = path.split("/").filter(Boolean).pop() || slug;
    }
  } catch {
    // keep raw
  }
  slug = slug.replace(/\.[a-z0-9]+$/i, "");
  const words = slug
    .split(/[-_+/]+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  if (!words.length) return "Untitled";
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Main keyword / Pinterest board name for an article.
 * Prefer rewritten title → original title → URL slug humanized.
 */
export function deriveKeywordBoardName(article: {
  rewrittenTitle?: string | null;
  originalTitle?: string | null;
  metaTitle?: string | null;
  sourceUrl: string;
  slug?: string | null;
}): string {
  const title =
    (article.rewrittenTitle || article.originalTitle || article.metaTitle || "").trim();
  if (title) {
    // Keep board names concise (Pinterest board name limits / readability)
    return title.replace(/\s+/g, " ").slice(0, 100);
  }
  if (article.slug?.trim()) return humanizeSlug(article.slug).slice(0, 100);
  return humanizeSlug(article.sourceUrl).slice(0, 100);
}
