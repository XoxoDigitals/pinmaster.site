"use client";

import { useEffect, useState } from "react";
import { MetricCard, PageHeader, Panel, statusColor } from "@/components/ui";

type Analytics = {
  metrics: {
    articlesProcessed: number;
    articlesPublished: number;
    pinsCreated: number;
    imagesGenerated: number;
    failedJobs: number;
    queueActive: number;
    successRate: number;
  };
  bloggerAnalytics: {
    totalPublished: number;
    publishedThisWeek: number;
    byBlog: Array<{
      blogId: string | null;
      name: string;
      url: string | null;
      count: number;
      publishedToday: number;
      dailyLimit: number;
    }>;
  };
  pinAnalytics: {
    totalPins: number;
    pinsThisWeek: number;
    byBoard: Array<{ boardName: string; count: number }>;
    recentPins: Array<{
      id: string;
      title: string | null;
      boardName: string | null;
      pinUrl: string | null;
      createdAt: string;
      articleTitle: string;
      bloggerPostUrl: string | null;
    }>;
  };
  recentArticles: Array<{
    id: string;
    sourceUrl: string;
    rewrittenTitle: string | null;
    originalTitle: string | null;
    status: string;
    updatedAt: string;
    errorMessage: string | null;
  }>;
  recentJobs: Array<{
    id: string;
    queueName: string;
    status: string;
    error: string | null;
    createdAt: string;
  }>;
};

export default function DashboardPage() {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error);
  }, []);

  const m = data?.metrics;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Pipeline health plus Blogger and Pinterest analytics."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <MetricCard label="Articles processed" value={m?.articlesProcessed ?? "—"} />
        <MetricCard label="Blogger published" value={m?.articlesPublished ?? "—"} />
        <MetricCard label="Pins created" value={m?.pinsCreated ?? "—"} />
        <MetricCard label="Images generated" value={m?.imagesGenerated ?? "—"} />
        <MetricCard label="Success rate" value={m ? `${m.successRate}%` : "—"} />
        <MetricCard label="Active jobs" value={m?.queueActive ?? "—"} />
        <MetricCard label="Failed jobs" value={m?.failedJobs ?? "—"} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <Panel>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Blogger analytics</h2>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--fg-muted)" }}>
            Total {data?.bloggerAnalytics.totalPublished ?? 0} · This week{" "}
            {data?.bloggerAnalytics.publishedThisWeek ?? 0}
          </p>
          <div style={{ display: "grid", gap: 10 }}>
            {(data?.bloggerAnalytics.byBlog || []).map((blog) => (
              <div
                key={blog.blogId || blog.name}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 8,
                }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 14 }}>{blog.name}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--fg-muted)" }}>
                    Today {blog.publishedToday}/{blog.dailyLimit || "—"}
                  </p>
                </div>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
                  {blog.count}
                </span>
              </div>
            ))}
            {!data?.bloggerAnalytics.byBlog?.length && (
              <p style={{ margin: 0, color: "var(--fg-muted)" }}>No Blogger publishes yet.</p>
            )}
          </div>
        </Panel>

        <Panel>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Pinterest analytics</h2>
          <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--fg-muted)" }}>
            Total {data?.pinAnalytics.totalPins ?? 0} · This week{" "}
            {data?.pinAnalytics.pinsThisWeek ?? 0}
          </p>
          <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
            {(data?.pinAnalytics.byBoard || []).map((board) => (
              <div
                key={board.boardName}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: 8,
                }}
              >
                <span style={{ fontSize: 14 }}>{board.boardName}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>
                  {board.count}
                </span>
              </div>
            ))}
            {!data?.pinAnalytics.byBoard?.length && (
              <p style={{ margin: 0, color: "var(--fg-muted)" }}>No pins yet.</p>
            )}
          </div>
          <h3 style={{ margin: "0 0 10px", fontSize: 13, color: "var(--fg-muted)" }}>
            Recent pins
          </h3>
          <div style={{ display: "grid", gap: 8 }}>
            {(data?.pinAnalytics.recentPins || []).slice(0, 8).map((pin) => (
              <div key={pin.id} style={{ fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pin.title || pin.articleTitle}
                  </span>
                  {pin.pinUrl && (
                    <a href={pin.pinUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>
                      Open
                    </a>
                  )}
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--fg-muted)" }}>
                  {pin.boardName || "Board"} · {new Date(pin.createdAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <Panel>
          <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>Recent articles</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {(data?.recentArticles || []).map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  paddingBottom: 10,
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {a.rewrittenTitle || a.originalTitle || a.sourceUrl}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--fg-muted)" }}>
                    {new Date(a.updatedAt).toLocaleString()}
                  </p>
                </div>
                <span style={{ color: statusColor(a.status), fontSize: 12, fontWeight: 600 }}>
                  {a.status}
                </span>
              </div>
            ))}
            {!data?.recentArticles?.length && (
              <p style={{ color: "var(--fg-muted)", margin: 0 }}>No articles yet.</p>
            )}
          </div>
        </Panel>

        <Panel>
          <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>Recent jobs</h2>
          <div style={{ display: "grid", gap: 10 }}>
            {(data?.recentJobs || []).map((j) => (
              <div key={j.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13 }}>{j.queueName}</span>
                  <span style={{ color: statusColor(j.status), fontSize: 12 }}>{j.status}</span>
                </div>
                {j.error && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--danger)" }}>
                    {j.error.slice(0, 120)}
                  </p>
                )}
              </div>
            ))}
            {!data?.recentJobs?.length && (
              <p style={{ color: "var(--fg-muted)", margin: 0 }}>No jobs yet.</p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
