"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, btnGhost, statusColor } from "@/components/ui";

type Job = {
  id: string;
  queueName: string;
  status: string;
  attempts: number;
  error: string | null;
  createdAt: string;
  article: {
    id: string;
    sourceUrl: string;
    rewrittenTitle: string | null;
    originalTitle: string | null;
  } | null;
};

export default function LogsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState("");

  async function load() {
    const url = filter ? `/api/jobs?status=${filter}` : "/api/jobs";
    const res = await fetch(url);
    setJobs(await res.json());
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function retry(jobId: string) {
    await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Logs"
        description="Job queue history with errors and retry actions."
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
            <option value="">All</option>
            <option value="FAILED">Failed</option>
            <option value="COMPLETED">Completed</option>
            <option value="ACTIVE">Active</option>
            <option value="QUEUED">Queued</option>
          </select>
        }
      />

      <div style={{ display: "grid", gap: 10 }}>
        {jobs.map((job) => (
          <Panel key={job.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{job.queueName}</p>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--fg-muted)" }}>
                  {job.article?.rewrittenTitle ||
                    job.article?.originalTitle ||
                    job.article?.sourceUrl ||
                    "System job"}{" "}
                  · attempt {job.attempts} · {new Date(job.createdAt).toLocaleString()}
                </p>
                {job.error && (
                  <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--danger)" }}>
                    {job.error}
                  </p>
                )}
              </div>
              <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                <span style={{ color: statusColor(job.status), fontSize: 12, fontWeight: 700 }}>
                  {job.status}
                </span>
                {job.status === "FAILED" && job.article && (
                  <button type="button" style={btnGhost} onClick={() => retry(job.id)}>
                    Retry
                  </button>
                )}
              </div>
            </div>
          </Panel>
        ))}
        {!jobs.length && (
          <Panel>
            <p style={{ margin: 0, color: "var(--fg-muted)" }}>No job logs yet.</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
