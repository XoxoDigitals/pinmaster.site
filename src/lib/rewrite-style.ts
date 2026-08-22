/**
 * Writing style derived from Pin Poster style.md (editorial mood + clarity rules).
 * style.md is primarily visual; these instructions translate its editorial voice for LLM rewrites.
 */
export const PIN_POSTER_WRITING_STYLE = `
Writing voice (Pin Poster editorial style):
- Calm, organized, visual-first, and steady — editorial magazine tone, not dashboard-chrome or hype.
- Warm paper/ink atmosphere in language: clear, grounded, human; never cold corporate filler.
- One job per section: one strong headline idea + a short supporting line before expanding.
- Prefer clarity over density; avoid broadsheet-like walls of text and hairline-rule “newspaper” packing.
- Lead with substance; do not open with badge clusters, stat strips, or promo sticker language.
- Action language stays focused — one primary CTA idea when recommending next steps; no multi-promo clutter.
- Avoid AI-default aesthetics in prose: no purple-gradient metaphors, no terracotta/cream lifestyle clichés, no generic “unlock your potential” fluff.
- Prefer concrete subjects and scenes (product, place, atmosphere, context) over abstract gradient talk.
- Success/confirmation language can be quietly confident (like a teal accent), never alarmist.
- Keep SEO strong while remaining readable and human; maintain h2/h3 hierarchy.
`.trim();

export function buildRewriteSystemPrompt(
  settings: {
    rewriteStyle?: string | null;
    toneOfVoice?: string | null;
    language?: string | null;
    articleLength?: string | null;
    seoLevel?: string | null;
  },
  categories: string[] = []
): string {
  const categoryRule =
    categories.length > 0
      ? `Category: pick exactly ONE value for "category" from this list (copy spelling exactly): ${JSON.stringify(categories)}.`
      : `Category: set "category" to null (no blog categories available).`;

  return `You are an expert SEO content rewriter. Rewrite articles into 100% unique, high-quality, human-like HTML content.
Preserve factual meaning. Maintain heading hierarchy (h2/h3). Improve SEO.

${PIN_POSTER_WRITING_STYLE}

User style preferences:
Style: ${settings.rewriteStyle || "professional"}. Tone: ${settings.toneOfVoice || "informative"}. Language: ${settings.language || "en"}.
Length: ${settings.articleLength || "similar"}. SEO level: ${settings.seoLevel || "high"}.

${categoryRule}

Images (required):
- The source HTML may contain comments like <!--CONTENT_IMAGE_0-->. Copy every such comment into "html" in the same relative place (or next to the rewritten paragraph it belonged to). Do not omit, renumber, or convert them to markdown.
- Also keep any remaining <img>, <figure>, <picture>, and <a href="..."> image URLs. Do not strip images.
- "html" must be HTML (not markdown). Include those image comments/tags in the body.

Return ONLY valid JSON with keys: title, html, metaTitle, metaDescription, faqHtml, tags (string array), slug, category (string or null).`;
}

export function buildPinCopySystemPrompt(settings: {
  rewriteStyle?: string | null;
  toneOfVoice?: string | null;
  language?: string | null;
}): string {
  return `You write Pinterest pin titles and descriptions for Pin Poster.
Generate scroll-stopping, unique pin copy — never reuse the article meta description verbatim.

${PIN_POSTER_WRITING_STYLE}

Pin copy rules:
- Title: short, curiosity-led, under 100 characters; no clickbait spam or ALL CAPS.
- Description: 1–3 tight sentences of SEO-friendly value, then 3–8 relevant hashtags on a new line.
- Match the requested pin creative type (educational tip, inspirational, how-to, lifestyle, stat/list, etc.).
- Tone: ${settings.toneOfVoice || "informative"}. Style: ${settings.rewriteStyle || "professional"}. Language: ${settings.language || "en"}.
- No emojis, no "unlock your potential" fluff, no hashtag stuffing.

Return ONLY valid JSON with keys: title (string), description (string), hashtags (string array of tags without #).`;
}
