import { XMLParser } from "fast-xml-parser";
import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

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

  // Sitemap index
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

  // Regular urlset
  const urlEntries = asArray(data.urlset?.url);
  for (const entry of urlEntries) {
    const loc = typeof entry === "string" ? entry : entry.loc;
    if (loc) urls.push(loc);
  }

  // RSS fallback
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
};

export async function extractArticleContent(url: string): Promise<ExtractedArticle> {
  const html = await fetchText(url);
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  const $ = cheerio.load(html);
  $("script, style, nav, footer, aside, iframe, noscript, .ads, .advertisement").remove();

  const metaDescription =
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    "";

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text) headings.push(text);
  });

  const images: string[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src");
    if (src && src.startsWith("http")) images.push(src);
  });

  const tags: string[] = [];
  $('meta[property="article:tag"]').each((_, el) => {
    const t = $(el).attr("content");
    if (t) tags.push(t);
  });
  $('a[rel="tag"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t) tags.push(t);
  });

  return {
    title: article?.title || $("title").text().trim() || "Untitled",
    content: article?.content || $("article").html() || $("main").html() || $("body").html() || "",
    metaDescription,
    headings,
    images: [...new Set(images)].slice(0, 20),
    tags: [...new Set(tags)].slice(0, 20),
  };
}
