"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader, Panel, btnGhost, btnPrimary, statusColor } from "@/components/ui";
import { sanitizeArticleHtml } from "@/lib/sanitize-html";

type PinPreview = {
  id: string;
  title: string | null;
  description: string | null;
  pinType: string;
  imageUrl: string | null;
  pinUrl: string | null;
  boardName: string;
  status: string;
};

type ArticleDetail = {
  id: string;
  sourceUrl: string;
  status: string;
  originalTitle: string | null;
  originalContent: string | null;
  rewrittenTitle: string | null;
  rewrittenHtml: string | null;
  bloggerCategory: string | null;
  bloggerPostUrl: string | null;
  pinUrl: string | null;
  featuredImageUrl: string | null;
  pinterestImageUrl: string | null;
  errorMessage: string | null;
  keywordBoardName: string;
  paired: boolean;
  pinsPerArticle: number;
  bloggerBlog: {
    id: string;
    name: string;
    googleAccount?: { email: string };
  } | null;
  originalMeta?: { pinterestImageUrls?: string[]; featuredImage?: string | null };
};

export default function ArticleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const articleId = String(params.articleId || "");

  const [article, setArticle] = useState<ArticleDetail | null>(null);
  const [pins, setPins] = useState<PinPreview[]>([]);
  const [boardName, setBoardName] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!articleId) return;
    const [artRes, pinRes] = await Promise.all([
      fetch(`/api/articles/${articleId}`),
      fetch(`/api/articles/${articleId}/pins`),
    ]);
    if (!artRes.ok) {
      setError("Article not found");
      return;
    }
    const art = await artRes.json();
    setArticle(art);
    if (pinRes.ok) {
      const pinData = await pinRes.json();
      setPins(Array.isArray(pinData.pins) ? pinData.pins : []);
      setBoardName(pinData.boardName || art.keywordBoardName || "");
    }
  }, [articleId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function runAction(action: string) {
    setBusy(action);
    setMessage("");
    setError("");
    const res = await fetch("/api/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ articleId, action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Action failed");
      return;
    }
    if (action === "schedule" && data.scheduledFor) {
      setMessage(`Scheduled for ${new Date(data.scheduledFor).toLocaleString()}`);
    } else {
      setMessage(
        action === "rewrite"
          ? "Rewrite queued"
          : action === "publish_now"
            ? "Publish started (remaining pipeline)"
            : action === "schedule"
              ? "Scheduled using your article/pin time slots"
              : "Done"
      );
    }
    await load();
  }

  async function generatePinCopy() {
    setBusy("pins");
    setError("");
    const res = await fetch(`/api/articles/${articleId}/pins?generate=1`);
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Could not generate pin preview");
      return;
    }
    setPins(Array.isArray(data.pins) ? data.pins : []);
    setBoardName(data.boardName || boardName);
    setMessage("Pin copy generated for preview");
  }

  if (!article) {
    return (
      <div>
        <PageHeader title="Article" description={error || "Loading…"} />
        <button type="button" style={btnGhost} onClick={() => router.push("/dashboard/articles")}>
          ← Articles
        </button>
      </div>
    );
  }

  const beforeHtml = article.originalContent
    ? sanitizeArticleHtml(article.originalContent)
    : "";
  const afterHtml = article.rewrittenHtml
    ? sanitizeArticleHtml(article.rewrittenHtml)
    : "";
  const sourceFeatured =
    article.originalMeta?.featuredImage ||
    article.featuredImageUrl ||
    null;
  const hasImages =
    Boolean(article.pinterestImageUrl) ||
    Boolean(article.originalMeta?.pinterestImageUrls?.length) ||
    Boolean(sourceFeatured) ||
    pins.some((p) => p.imageUrl);
  const showPinPreview =
    hasImages || pins.length > 0 || ["PUBLISHING", "PINNING", "COMPLETED", "IMAGING"].includes(article.status);

  const blogHref = article.bloggerBlog
    ? `/dashboard/articles?blogId=${article.bloggerBlog.id}`
    : "/dashboard/articles";

  return (
    <div>
      <PageHeader
        title={article.rewrittenTitle || article.originalTitle || "Untitled"}
        description={`${article.bloggerBlog?.name || "Unassigned"} · ${article.status}`}
        action={
          <Link href={blogHref} style={btnGhost}>
            ← Blog articles
          </Link>
        }
      />

      {(message || error) && (
        <p
          style={{
            margin: "0 0 14px",
            fontSize: 13,
            color: error ? "var(--danger)" : "var(--success)",
          }}
        >
          {error || message}
        </p>
      )}

      <Panel style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>Source</p>
            <a
              href={article.sourceUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: "var(--pin)", wordBreak: "break-all", fontSize: 13 }}
            >
              {article.sourceUrl}
            </a>
            {article.bloggerCategory && (
              <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                Blogger category: <strong>{article.bloggerCategory}</strong>
              </p>
            )}
            {article.errorMessage && (
              <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--danger)" }}>
                {article.errorMessage}
              </p>
            )}
          </div>
          <span style={{ color: statusColor(article.status), fontWeight: 700, fontSize: 13 }}>
            {article.status}
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
          <button
            type="button"
            style={btnPrimary}
            disabled={Boolean(busy)}
            onClick={() => runAction("rewrite")}
          >
            {busy === "rewrite" ? "Queuing…" : "Rewrite Now"}
          </button>
          <button
            type="button"
            style={btnPrimary}
            disabled={Boolean(busy) || !article.paired}
            onClick={() => runAction("publish_now")}
            title={article.paired ? undefined : "Pair blog with Pinterest first"}
          >
            {busy === "publish_now" ? "Starting…" : "Publish now"}
          </button>
          <button
            type="button"
            style={btnGhost}
            disabled={Boolean(busy) || !article.paired}
            onClick={() => runAction("schedule")}
          >
            {busy === "schedule" ? "Scheduling…" : "Schedule"}
          </button>
          {article.bloggerPostUrl && (
            <a href={article.bloggerPostUrl} target="_blank" rel="noreferrer" style={btnGhost}>
              Blogger post
            </a>
          )}
          {article.pinUrl && (
            <a href={article.pinUrl} target="_blank" rel="noreferrer" style={btnGhost}>
              Pinterest pin
            </a>
          )}
        </div>
        {!article.paired && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--warn)" }}>
            Publish/Schedule require a Pinterest pair on the Blogger page.
          </p>
        )}
      </Panel>

      {(article.originalContent || article.rewrittenHtml) && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <Panel>
            <p style={{ margin: 0, fontWeight: 700, color: "var(--pin)" }}>Before</p>
            <p style={{ margin: "8px 0 0", fontWeight: 600 }}>
              {article.originalTitle || "—"}
            </p>
            {sourceFeatured && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={sourceFeatured}
                alt=""
                style={{
                  display: "block",
                  width: "100%",
                  maxHeight: 160,
                  objectFit: "cover",
                  marginTop: 10,
                  borderRadius: 8,
                }}
              />
            )}
            {beforeHtml ? (
              <div
                className="article-html-preview"
                style={{
                  marginTop: 10,
                  maxHeight: 320,
                  overflow: "auto",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--ink)",
                }}
                dangerouslySetInnerHTML={{ __html: beforeHtml }}
              />
            ) : (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
                No original content yet.
              </p>
            )}
          </Panel>
          <Panel>
            <p style={{ margin: 0, fontWeight: 700, color: "var(--success)" }}>After</p>
            <p style={{ margin: "8px 0 0", fontWeight: 600 }}>
              {article.rewrittenTitle || "—"}
            </p>
            {afterHtml ? (
              <div
                className="article-html-preview"
                style={{
                  marginTop: 10,
                  maxHeight: 320,
                  overflow: "auto",
                  fontSize: 13,
                  lineHeight: 1.55,
                  color: "var(--ink)",
                }}
                dangerouslySetInnerHTML={{ __html: afterHtml }}
              />
            ) : (
              <p style={{ margin: "10px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
                Rewrite not ready yet.
              </p>
            )}
          </Panel>
        </div>
      )}

      {showPinPreview && (
        <Panel>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontSize: "1.25rem",
                }}
              >
                Pinterest pins preview
              </h2>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
                Board: <strong>{boardName || article.keywordBoardName}</strong> (created from main
                keyword on publish)
              </p>
            </div>
            <button
              type="button"
              style={btnGhost}
              disabled={Boolean(busy) || !hasImages}
              onClick={generatePinCopy}
            >
              {busy === "pins" ? "Generating…" : "Generate pin copy"}
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
              marginTop: 16,
            }}
          >
            {pins.map((pin) => (
              <div
                key={pin.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.5)",
                }}
              >
                {pin.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={pin.imageUrl}
                    alt={pin.title || pin.pinType}
                    style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div
                    style={{
                      aspectRatio: "2/3",
                      background: "var(--bg-soft)",
                      display: "grid",
                      placeItems: "center",
                      color: "var(--ink-soft)",
                      fontSize: 12,
                      padding: 12,
                      textAlign: "center",
                    }}
                  >
                    Image pending
                  </div>
                )}
                <div style={{ padding: "0.75rem" }}>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--pin)", fontWeight: 600 }}>
                    {pin.pinType}
                  </p>
                  <p style={{ margin: "6px 0 0", fontWeight: 600, fontSize: 13 }}>
                    {pin.title || "Title pending"}
                  </p>
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 12,
                      color: "var(--ink-soft)",
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {pin.description || "Description pending — generate pin copy."}
                  </p>
                </div>
              </div>
            ))}
            {!pins.length && (
              <p style={{ margin: 0, color: "var(--ink-soft)", fontSize: 13 }}>
                Pin images appear after imaging finishes.
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button
              type="button"
              style={btnPrimary}
              disabled={Boolean(busy) || !article.paired}
              onClick={() => runAction("publish_now")}
            >
              Publish now
            </button>
            <button
              type="button"
              style={btnGhost}
              disabled={Boolean(busy) || !article.paired}
              onClick={() => runAction("schedule")}
            >
              Schedule
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}
