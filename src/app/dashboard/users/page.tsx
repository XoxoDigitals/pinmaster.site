"use client";

import { FormEvent, useEffect, useState } from "react";
import { PageHeader, Panel } from "@/components/ui";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
  disabled: boolean;
  createdAt: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/users");
    if (res.status === 403 || res.status === 401) {
      setError("Admin access required.");
      return;
    }
    const data = await res.json();
    if (Array.isArray(data)) setUsers(data);
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name: name || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not create user");
      return;
    }
    setEmail("");
    setPassword("");
    setName("");
    await load();
  }

  async function setDisabled(id: string, disabled: boolean) {
    setError("");
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ disabled }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
    await load();
  }

  async function removeUser(id: string, userEmail: string) {
    if (!confirm(`Delete ${userEmail}? This cannot be undone.`)) return;
    setError("");
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Users"
        description="Create logins for other people. Each user keeps their own blogs, pins, sitemaps, jobs, and AI keys."
      />

      {error && (
        <p style={{ color: "var(--pin)", marginBottom: 16, fontSize: 13 }}>{error}</p>
      )}

      <form onSubmit={addUser} style={{ display: "grid", gap: 16, maxWidth: 560, marginBottom: 24 }}>
        <Panel>
          <h2
            style={{
              margin: "0 0 14px",
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "1.15rem",
              fontWeight: 700,
            }}
          >
            Add user
          </h2>
          <div style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500 }}>
              Email
              <input
                className="input-field"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500 }}>
              Password
              <input
                className="input-field"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
            <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500 }}>
              Name (optional)
              <input
                className="input-field"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button type="submit" className="btn-primary" disabled={saving} style={{ width: "fit-content" }}>
              {saving ? "Adding…" : "Add user"}
            </button>
          </div>
        </Panel>
      </form>

      <Panel>
        <h2
          style={{
            margin: "0 0 14px",
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "1.15rem",
            fontWeight: 700,
          }}
        >
          All users
        </h2>
        <div style={{ display: "grid", gap: 8 }}>
          {users.map((u) => (
            <div
              key={u.id}
              className="surface"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "0.85rem 1rem",
                borderRadius: 14,
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{u.email}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {u.name || "No name"} · {u.role}
                  {u.disabled ? " · disabled" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: "0.45rem 0.9rem" }}
                  onClick={() => setDisabled(u.id, !u.disabled)}
                >
                  {u.disabled ? "Enable" : "Disable"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: "0.45rem 0.9rem" }}
                  onClick={() => removeUser(u.id, u.email)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>No users loaded.</p>
          )}
        </div>
      </Panel>
    </div>
  );
}
