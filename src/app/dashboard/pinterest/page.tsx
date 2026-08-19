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

export default function PinterestPage() {
  const [accounts, setAccounts] = useState<PinAccount[]>([]);

  async function load() {
    const res = await fetch("/api/pinterest");
    setAccounts(await res.json());
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

      <div style={{ display: "grid", gap: 14 }}>
        {accounts.map((account) => (
          <Panel key={account.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>@{account.username || "unknown"}</h2>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--fg-muted)" }}>
                  Pins today: {account.pinsToday}/{account.dailyPinLimit}
                </p>
              </div>
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
