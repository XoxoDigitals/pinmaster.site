"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  Panel,
  StatusBadge,
  btnPrimary,
  btnGhost,
  inputStyle,
} from "@/components/ui";

type Blog = {
  id: string;
  name: string;
  url: string | null;
  enabled: boolean;
  schedule: string;
  dailyLimit: number;
  publishMode: string;
  publishedToday: number;
  pinterestMap: {
    pinterestAccountId: string;
    pinterestBoardId: string | null;
    pinterestAccount?: { id: string; username: string | null };
    pinterestBoard?: { id: string; name: string } | null;
  } | null;
};

type Account = {
  id: string;
  email: string;
  blogs: Blog[];
};

type PinAccount = {
  id: string;
  username: string | null;
  boards: Array<{ id: string; boardId: string; name: string }>;
};

type DraftPair = {
  accountId: string;
  boardId: string;
};

export default function BlogsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pinAccounts, setPinAccounts] = useState<PinAccount[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftPair>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [blogsRes, pinsRes] = await Promise.all([
      fetch("/api/blogs"),
      fetch("/api/pinterest"),
    ]);
    const blogsJson = await blogsRes.json();
    const pinsJson = await pinsRes.json();
    setAccounts(Array.isArray(blogsJson) ? blogsJson : []);
    setPinAccounts(Array.isArray(pinsJson) ? pinsJson : []);

    const nextDrafts: Record<string, DraftPair> = {};
    for (const account of Array.isArray(blogsJson) ? blogsJson : []) {
      for (const blog of account.blogs as Blog[]) {
        nextDrafts[blog.id] = {
          accountId: blog.pinterestMap?.pinterestAccountId || "",
          boardId: blog.pinterestMap?.pinterestBoardId || "",
        };
      }
    }
    setDrafts(nextDrafts);
  }

  useEffect(() => {
    load();
  }, []);

  const pinAccountById = useMemo(() => {
    const map = new Map<string, PinAccount>();
    for (const account of pinAccounts) map.set(account.id, account);
    return map;
  }, [pinAccounts]);

  async function updateBlog(blogId: string, patch: Record<string, unknown>) {
    setError("");
    setMessage("");
    const res = await fetch("/api/blogs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blogId, ...patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not update blog");
      return;
    }
    await load();
  }

  async function disconnectGoogle(accountId: string, email: string) {
    if (
      !window.confirm(
        `Disconnect ${email}? This removes the Google account and its blogs from Pin Poster.`
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    const res = await fetch(`/api/blogs?id=${encodeURIComponent(accountId)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not disconnect Google account");
      return;
    }
    setMessage(`Disconnected ${email}`);
    await load();
  }

  function pinAccountLabel(p: PinAccount) {
    return p.username ? `@${p.username}` : p.id;
  }

  async function saveMapping(bloggerBlogId: string) {
    const draft = drafts[bloggerBlogId];
    if (!draft?.accountId) {
      setError("Select a Pinterest account before saving the pair.");
      return;
    }

    setSavingId(bloggerBlogId);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bloggerBlogId,
          pinterestAccountId: draft.accountId,
          pinterestBoardId: draft.boardId || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not save Pinterest pair");
        return;
      }
      setMessage("Pinterest pair saved");
      await load();
    } finally {
      setSavingId(null);
    }
  }

  function setDraft(blogId: string, patch: Partial<DraftPair>) {
    setDrafts((prev) => {
      const current = prev[blogId] || { accountId: "", boardId: "" };
      const next = { ...current, ...patch };
      if (patch.accountId !== undefined && patch.accountId !== current.accountId) {
        next.boardId = "";
      }
      return { ...prev, [blogId]: next };
    });
  }

  function pairLabel(blog: Blog) {
    const mapped = blog.pinterestMap?.pinterestAccount;
    const fromList = pinAccountById.get(blog.pinterestMap?.pinterestAccountId || "");
    const username = mapped?.username || fromList?.username;
    const accountName = username
      ? `@${username}`
      : blog.pinterestMap?.pinterestAccountId;
    const boardName =
      blog.pinterestMap?.pinterestBoard?.name ||
      (blog.pinterestMap?.pinterestBoardId
        ? pinAccounts
            .flatMap((p) => p.boards)
            .find((b) => b.id === blog.pinterestMap?.pinterestBoardId)?.name
        : null);
    if (!accountName) return null;
    return boardName ? `${accountName} → ${boardName}` : `${accountName} → auto board`;
  }

  return (
    <div>
      <PageHeader
        title="Blogger"
        description="Connect Google accounts, pair each blog with a Pinterest account (and optional board), then enable automation."
        action={
          <a href="/api/oauth/google" style={btnPrimary}>
            Connect Google
          </a>
        }
      />

      {message && (
        <p style={{ color: "var(--accent)", marginBottom: 12 }}>{message}</p>
      )}
      {error && (
        <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {accounts.map((account) => (
          <Panel key={account.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              <h2 style={{ margin: 0, fontSize: 15, color: "var(--accent)" }}>
                {account.email}
              </h2>
              <button
                type="button"
                style={{
                  ...btnGhost,
                  color: "var(--danger)",
                  borderColor: "rgba(196, 30, 58, 0.35)",
                }}
                onClick={() => disconnectGoogle(account.id, account.email)}
              >
                Disconnect
              </button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {account.blogs.map((blog) => {
                const paired = Boolean(blog.pinterestMap?.pinterestAccountId);
                const draft = drafts[blog.id] || { accountId: "", boardId: "" };
                const selectedPin = pinAccountById.get(draft.accountId);
                const boards = selectedPin?.boards || [];
                const label = pairLabel(blog);

                return (
                  <div
                    key={blog.id}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 14,
                      background: "var(--bg-soft)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600 }}>{blog.name}</p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--fg-muted)" }}>
                          {blog.url || blog.id} · Today: {blog.publishedToday}/{blog.dailyLimit}
                        </p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <StatusBadge
                          ok={paired}
                          okLabel="Paired"
                          missingLabel="Unpaired"
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={blog.enabled}
                            onChange={(e) => {
                              if (e.target.checked && !paired) {
                                setError(
                                  "Pair this blog with a Pinterest account before enabling automation."
                                );
                                return;
                              }
                              updateBlog(blog.id, { enabled: e.target.checked });
                            }}
                          />
                          Enabled
                        </label>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: 10,
                        marginTop: 12,
                      }}
                    >
                      <label style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                        Schedule
                        <select
                          value={blog.schedule}
                          onChange={(e) => updateBlog(blog.id, { schedule: e.target.value })}
                          style={{ ...inputStyle, marginTop: 4 }}
                        >
                          <option value="EVERY_15_MIN">Every 15 min</option>
                          <option value="HOURLY">Hourly</option>
                          <option value="EVERY_6_HOURS">Every 6 hours</option>
                          <option value="DAILY">Daily</option>
                          <option value="MANUAL">Manual</option>
                        </select>
                      </label>
                      <label style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                        Daily limit
                        <input
                          type="number"
                          min={1}
                          value={blog.dailyLimit}
                          onChange={(e) =>
                            updateBlog(blog.id, { dailyLimit: Number(e.target.value) })
                          }
                          style={{ ...inputStyle, marginTop: 4 }}
                        />
                      </label>
                      <label style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                        Publish mode
                        <select
                          value={blog.publishMode}
                          onChange={(e) => updateBlog(blog.id, { publishMode: e.target.value })}
                          style={{ ...inputStyle, marginTop: 4 }}
                        >
                          <option value="PUBLISH">Publish</option>
                          <option value="DRAFT">Draft</option>
                          <option value="SCHEDULED">Scheduled</option>
                        </select>
                      </label>
                    </div>

                    <div
                      style={{
                        marginTop: 14,
                        paddingTop: 12,
                        borderTop: "1px solid var(--border)",
                        display: "grid",
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                          alignItems: "baseline",
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                            Pinterest pair
                          </p>
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--fg-muted)" }}>
                            Required for automation. Pins always use this account
                            {draft.boardId ? " and board" : " (board optional — auto-created if blank)"}.
                          </p>
                        </div>
                        {label ? (
                          <p style={{ margin: 0, fontSize: 12, color: "var(--accent)" }}>{label}</p>
                        ) : (
                          <p style={{ margin: 0, fontSize: 12, color: "var(--danger)" }}>
                            No pair saved — enable blocked
                          </p>
                        )}
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <select
                          value={draft.accountId}
                          onChange={(e) => setDraft(blog.id, { accountId: e.target.value })}
                          style={{ ...inputStyle, maxWidth: 240 }}
                        >
                          <option value="">Select Pinterest account</option>
                          {pinAccounts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {pinAccountLabel(p)}
                            </option>
                          ))}
                        </select>
                        <select
                          value={draft.boardId}
                          onChange={(e) => setDraft(blog.id, { boardId: e.target.value })}
                          disabled={!draft.accountId}
                          style={{ ...inputStyle, maxWidth: 240 }}
                        >
                          <option value="">Auto-create board on pin</option>
                          {boards.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          style={btnGhost}
                          disabled={!draft.accountId || savingId === blog.id}
                          onClick={() => saveMapping(blog.id)}
                        >
                          {savingId === blog.id ? "Saving…" : "Save pair"}
                        </button>
                      </div>

                      {!pinAccounts.length && (
                        <p style={{ margin: 0, fontSize: 12, color: "var(--warn)" }}>
                          Connect a Pinterest account under Pinterest before pairing.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {!account.blogs.length && (
                <p style={{ color: "var(--fg-muted)", margin: 0 }}>No blogs found on this account.</p>
              )}
            </div>
          </Panel>
        ))}

        {!accounts.length && (
          <Panel>
            <p style={{ margin: 0, color: "var(--fg-muted)" }}>
              No Google accounts connected yet. Click Connect Google to begin.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
