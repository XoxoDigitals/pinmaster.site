"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Panel, btnGhost, btnPrimary, statusColor } from "@/components/ui";

type BlogCard = {
  id: string;
  name: string;
  url: string | null;
  enabled: boolean;
  dailyLimit: number;
  publishedToday: number;
  articleCount?: number;
  categoryList?: string[];
};

type Account = {
  id: string;
  email: string;
  blogs: BlogCard[];
};

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
  scheduledAt: string | null;
  scheduledAtGmt5: string | null;
  bloggerCategory: string | null;
  bloggerBlog: { name: string } | null;
};

function ArticlesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const blogId = searchParams.get("blogId");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [blogName, setBlogName] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadAccounts = useCallback(async () => {
    const res = await fetch("/api/blogs");
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
  }, []);

  const loadArticles = useCallback(async () => {
    if (!blogId) return;
    const params = new URLSearchParams({ bloggerBlogId: blogId, take: "100" });
    if (filter) params.set("status", filter);
    const res = await fetch(`/api/articles?${params}`);
    const data = await res.json();
    setArticles(Array.isArray(data) ? data : []);
  }, [blogId, filter]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadAccounts();
      if (blogId) await loadArticles();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [blogId, loadAccounts, loadArticles]);

  useEffect(() => {
    if (!blogId || !accounts.length) {
      setBlogName("");
      return;
    }
    for (const account of accounts) {
      const blog = account.blogs.find((b) => b.id === blogId);
      if (blog) {
        setBlogName(blog.name);
        return;
      }
    }
  }, [accounts, blogId]);

  async function rewriteNow(articleId: string) {
    setMessage("");
    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, action: "rewrite" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data.error || "Rewrite failed");
      return;
    }
    setMessage("Rewrite queued");
    await loadArticles();
  }

  if (blogId) {
    return (
      <div>
        <PageHeader
          title={blogName || "Articles"}
          description="Articles for this blog. Use Rewrite Now on a single item — the scheduler only processes the daily quota automatically."
          action={
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" style={btnGhost} onClick={() => router.push("/dashboard/articles")}>
                ← All blogs
              </button>
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
            </div>
          }
        />

        {message && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--ink-soft)" }}>{message}</p>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          {articles.map((article) => (
            <Panel key={article.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <Link
                    href={`/dashboard/articles/${article.id}`}
                    style={{
                      margin: 0,
                      fontWeight: 600,
                      color: "var(--ink)",
                      textDecoration: "none",
                    }}
                  >
                    {article.rewrittenTitle || article.originalTitle || article.sourceUrl}
                  </Link>
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
                    {article.scheduledAtGmt5
                      ? `Scheduled rewrite/publish: ${article.scheduledAtGmt5}`
                      : article.scheduledAt
                        ? `Scheduled rewrite/publish: ${new Date(article.scheduledAt).toLocaleString("en-US", { timeZone: "Asia/Karachi" })} GMT+5`
                        : "Scheduled rewrite/publish: not assigned yet"}
                    {article.bloggerCategory ? ` · ${article.bloggerCategory}` : ""}
                  </p>
                  {article.errorMessage && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--danger)" }}>
                      {article.errorMessage}
                    </p>
                  )}
                </div>
                <div style={{ display: "grid", gap: 8, justifyItems: "end", alignContent: "start" }}>
                  <span style={{ color: statusColor(article.status), fontSize: 12, fontWeight: 700 }}>
                    {article.status}
                  </span>
                  <Link href={`/dashboard/articles/${article.id}`} style={{ ...btnGhost, fontSize: 13 }}>
                    Open
                  </Link>
                  {["DISCOVERED", "FAILED", "EXTRACTING", "REWRITING"].includes(article.status) && (
                    <button type="button" style={btnPrimary} onClick={() => rewriteNow(article.id)}>
                      Rewrite Now
                    </button>
                  )}
                </div>
              </div>
            </Panel>
          ))}
          {!loading && !articles.length && (
            <Panel>
              <p style={{ margin: 0, color: "var(--fg-muted)" }}>
                No articles for this blog yet. Crawl a sitemap to discover URLs — they stay DISCOVERED
                until the daily quota starts them.
              </p>
            </Panel>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Articles"
        description="Choose a Google account blog, then work articles one blog at a time."
      />

      {loading && (
        <Panel>
          <p style={{ margin: 0, color: "var(--fg-muted)" }}>Loading accounts…</p>
        </Panel>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {accounts.map((account) => (
          <Panel key={account.id}>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--pin)",
              }}
            >
              {account.email}
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 12,
                marginTop: 14,
              }}
            >
              {account.blogs.map((blog) => (
                <button
                  key={blog.id}
                  type="button"
                  onClick={() => router.push(`/dashboard/articles?blogId=${blog.id}`)}
                  style={{
                    textAlign: "left",
                    padding: "1rem 1.1rem",
                    borderRadius: 14,
                    border: "1px solid var(--line)",
                    background: "rgba(255,255,255,0.55)",
                    cursor: "pointer",
                    color: "var(--ink)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 700,
                      fontFamily: "var(--font-display), system-ui, sans-serif",
                    }}
                  >
                    {blog.name}
                  </p>
                  <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ink-soft)" }}>
                    {blog.articleCount ?? 0} articles · Today {blog.publishedToday}/{blog.dailyLimit}
                    {blog.enabled ? "" : " · paused"}
                  </p>
                  {blog.url && (
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 11,
                        color: "var(--fg-muted)",
                        wordBreak: "break-all",
                      }}
                    >
                      {blog.url}
                    </p>
                  )}
                </button>
              ))}
              {!account.blogs.length && (
                <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: 13 }}>
                  No blogs on this account. Connect them under Blogger.
                </p>
              )}
            </div>
          </Panel>
        ))}
        {!loading && !accounts.length && (
          <Panel>
            <p style={{ margin: 0, color: "var(--fg-muted)" }}>
              Connect a Google account on the Blogger page first.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

export default function ArticlesPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--ink-soft)" }}>Loading articles…</p>}>
      <ArticlesPageInner />
    </Suspense>
  );
}
