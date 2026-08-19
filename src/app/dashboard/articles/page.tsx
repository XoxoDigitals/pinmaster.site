"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, btnGhost, statusColor } from "@/components/ui";

type Article = {
  id: string;
  sourceUrl: string;
  originalTitle: string | null;
  rewrittenTitle: string | null;
  status: string;
  bloggerPostUrl: string | null;
  pinUrl: string | null;
  errorMessage: string | null;
  updatedAt: string;
  bloggerBlog: { name: string } | null;
};

export default function ArticlesPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [filter, setFilter] = useState("");

  async function load() {
    const url = filter ? `/api/articles?status=${filter}` : "/api/articles";
    const res = await fetch(url);
    setArticles(await res.json());
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function retry(articleId: string) {
    await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, action: "retry" }),
    });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Articles"
        description="Pipeline status for discovered, rewritten, published, and pinned content."
        action={
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "0.55rem 0.85rem",
              color: "var(--fg)",
            }}
          >
            <option value="">All statuses</option>
            {[
              "DISCOVERED",
              "EXTRACTING",
              "REWRITING",
              "IMAGING",
              "PUBLISHING",
              "PINNING",
              "COMPLETED",
              "FAILED",
            ].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        }
      />

      <div style={{ display: "grid", gap: 10 }}>
        {articles.map((article) => (
          <Panel key={article.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {article.rewrittenTitle || article.originalTitle || "Untitled"}
                </p>
                <p
                  style={{
                    margin: "6px 0 0",
                    fontSize: 12,
                    color: "var(--fg-muted)",
                    wordBreak: "break-all",
                  }}
                >
                  {article.sourceUrl}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--fg-muted)" }}>
                  {article.bloggerBlog?.name || "Unassigned blog"} ·{" "}
                  {new Date(article.updatedAt).toLocaleString()}
                </p>
                {article.errorMessage && (
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--danger)" }}>
                    {article.errorMessage}
                  </p>
                )}
                <div style={{ marginTop: 8, display: "flex", gap: 12, fontSize: 12 }}>
                  {article.bloggerPostUrl && (
                    <a href={article.bloggerPostUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                      Blogger post
                    </a>
                  )}
                  {article.pinUrl && (
                    <a href={article.pinUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                      Pinterest pin
                    </a>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <span style={{ color: statusColor(article.status), fontSize: 12, fontWeight: 700 }}>
                  {article.status}
                </span>
                {article.status === "FAILED" && (
                  <button type="button" style={btnGhost} onClick={() => retry(article.id)}>
                    Retry
                  </button>
                )}
              </div>
            </div>
          </Panel>
        ))}
        {!articles.length && (
          <Panel>
            <p style={{ margin: 0, color: "var(--fg-muted)" }}>No articles in the queue yet.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
