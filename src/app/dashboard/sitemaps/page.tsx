"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, btnPrimary, btnGhost, inputStyle } from "@/components/ui";

type Source = {
  id: string;
  url: string;
  type: string;
  enabled: boolean;
  lastCrawledAt: string | null;
  lastError: string | null;
  _count: { articles: number };
  crawlHistory: Array<{
    id: string;
    urlsFound: number;
    urlsNew: number;
    status: string;
    createdAt: string;
  }>;
};

type Blog = { id: string; name: string };

export default function SitemapsPage() {
  const [sources, setSources] = useState<Source[]>([]);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [url, setUrl] = useState("");
  const [type, setType] = useState("SITEMAP");
  const [bloggerBlogId, setBloggerBlogId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [sRes, bRes] = await Promise.all([fetch("/api/sitemaps"), fetch("/api/blogs")]);
    setSources(await sRes.json());
    const accounts = await bRes.json();
    setBlogs(accounts.flatMap((a: { blogs: Blog[] }) => a.blogs));
  }

  useEffect(() => {
    load();
  }, []);

  async function addSource(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/sitemaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, type, bloggerBlogId: bloggerBlogId || undefined }),
    });
    setUrl("");
    setBusy(false);
    await load();
  }

  async function crawlNow(id: string) {
    await fetch("/api/sitemaps/crawl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/sitemaps?id=${id}`, { method: "DELETE" });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Sitemaps"
        description="Add XML sitemaps or indexes. New URLs are deduped and queued for extraction."
      />

      <Panel style={{ marginBottom: 16 }}>
        <form
          onSubmit={addSource}
          style={{ display: "grid", gridTemplateColumns: "1.5fr 140px 180px auto", gap: 10 }}
        >
          <input
            placeholder="https://example.com/sitemap.xml"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            style={inputStyle}
          />
          <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
            <option value="SITEMAP">Sitemap</option>
            <option value="SITEMAP_INDEX">Sitemap index</option>
            <option value="RSS">RSS</option>
          </select>
          <select
            value={bloggerBlogId}
            onChange={(e) => setBloggerBlogId(e.target.value)}
            style={inputStyle}
          >
            <option value="">Link to blog (optional)</option>
            {blogs.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy} style={btnPrimary}>
            {busy ? "Adding…" : "Add & crawl"}
          </button>
        </form>
      </Panel>

      <div style={{ display: "grid", gap: 12 }}>
        {sources.map((source) => (
          <Panel key={source.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, wordBreak: "break-all" }}>{source.url}</p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--fg-muted)" }}>
                  {source.type} · {source._count.articles} articles · Last crawl:{" "}
                  {source.lastCrawledAt
                    ? new Date(source.lastCrawledAt).toLocaleString()
                    : "never"}
                </p>
                {source.lastError && (
                  <p style={{ margin: "6px 0 0", color: "var(--danger)", fontSize: 12 }}>
                    {source.lastError}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" style={btnGhost} onClick={() => crawlNow(source.id)}>
                  Crawl now
                </button>
                <button type="button" style={btnGhost} onClick={() => remove(source.id)}>
                  Remove
                </button>
              </div>
            </div>
            {!!source.crawlHistory.length && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--fg-muted)" }}>
                Recent:{" "}
                {source.crawlHistory
                  .map(
                    (h) =>
                      `${new Date(h.createdAt).toLocaleDateString()} +${h.urlsNew}/${h.urlsFound}`
                  )
                  .join(" · ")}
              </div>
            )}
          </Panel>
        ))}
        {!sources.length && (
          <Panel>
            <p style={{ margin: 0, color: "var(--fg-muted)" }}>No sitemaps added yet.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
