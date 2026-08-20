"use client";

import { useEffect, useState } from "react";
import { PageHeader, Panel, btnPrimary, btnGhost, inputStyle } from "@/components/ui";

type PinAccount = {
  id: string;
  username: string | null;
  dailyPinLimit: number;
  pinsToday: number;
  boards: Array<{ id: string; name: string; boardId: string }>;
};

function displayUsername(account: PinAccount) {
  return account.username ? `@${account.username}` : account.id;
}

export default function PinterestPage() {
  const [accounts, setAccounts] = useState<PinAccount[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/pinterest");
    const data = await res.json();
    setAccounts(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    load();
  }, []);

  async function updateLimit(accountId: string, dailyPinLimit: number) {
    await fetch("/api/pinterest", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, dailyPinLimit }),
    });
    await load();
  }

  async function disconnect(account: PinAccount) {
    const label = displayUsername(account);
    if (
      !window.confirm(
        `Disconnect ${label}? This removes the Pinterest account and clears blog pairings that used it.`
      )
    ) {
      return;
    }
    setError("");
    setMessage("");
    const res = await fetch(`/api/pinterest?id=${encodeURIComponent(account.id)}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Could not disconnect Pinterest account");
      return;
    }
    setMessage(`Disconnected ${label}`);
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Pinterest"
        description="Connect accounts, review boards, and set daily pin limits."
        action={
          <a href="/api/oauth/pinterest" style={btnPrimary}>
            Connect Pinterest
          </a>
        }
      />

      {message && (
        <p style={{ color: "var(--accent)", marginBottom: 12 }}>{message}</p>
      )}
      {error && (
        <p style={{ color: "var(--danger)", marginBottom: 12 }}>{error}</p>
      )}

      <div style={{ display: "grid", gap: 14 }}>
        {accounts.map((account) => (
          <Panel key={account.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "flex-start",
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 18,
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontWeight: 700,
                    color: "var(--ink)",
                  }}
                >
                  {displayUsername(account)}
                </h2>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--fg-muted)" }}>
                  Pins today: {account.pinsToday}/{account.dailyPinLimit}
                </p>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
                <label style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                  Daily pin limit
                  <input
                    type="number"
                    min={1}
                    value={account.dailyPinLimit}
                    onChange={(e) => updateLimit(account.id, Number(e.target.value))}
                    style={{ ...inputStyle, marginTop: 4, width: 100 }}
                  />
                </label>
                <button
                  type="button"
                  style={{
                    ...btnGhost,
                    color: "var(--danger)",
                    borderColor: "rgba(196, 30, 58, 0.35)",
                  }}
                  onClick={() => disconnect(account)}
                >
                  Disconnect
                </button>
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
              {account.boards.map((b) => (
                <span
                  key={b.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 12,
                    color: "var(--fg-muted)",
                  }}
                >
                  {b.name}
                </span>
              ))}
              {!account.boards.length && (
                <span style={{ color: "var(--fg-muted)", fontSize: 13 }}>
                  No boards synced yet — boards are created automatically when needed.
                </span>
              )}
            </div>
          </Panel>
        ))}

        {!accounts.length && (
          <Panel>
            <p style={{ margin: 0, color: "var(--fg-muted)" }}>
              No Pinterest accounts connected.{" "}
              <a href="/api/oauth/pinterest" style={{ color: "var(--accent)" }}>
                Connect one
              </a>
              .
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
