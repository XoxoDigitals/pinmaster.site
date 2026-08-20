"use client";

import { Suspense, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader, Panel, StatusBadge } from "@/components/ui";
import {
  WEEKDAYS,
  type WeekdayKey,
  resizePostTimes,
  spreadPostTimesEvenly,
} from "@/lib/schedule";

type Settings = {
  isAdmin: boolean;
  model: string;
  imageModel: string;
  rewriteStyle: string;
  articleLength: string;
  seoLevel: string;
  imageStyle: string;
  imageSystemPrompt: string;
  language: string;
  toneOfVoice: string;
  dailyImageLimit: number;
  pinsPerArticle: number;
  boardsPerArticle: number;
  articlePostTimes: string[];
  pinPostTimes: string[];
  defaultSchedule: string;
  scheduleHour: number;
  postingDays: string;
  postingHoursByDay: Partial<Record<WeekdayKey, number>>;
  scheduleWindowStart: number | null;
  scheduleWindowEnd: number | null;
  defaultDailyLimit: number;
  openRouterKey: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  pinterestAppId: string;
  pinterestAppSecret: string;
  pinterestRedirectUri: string;
  contentProvider: string;
  googleAiModel: string;
  googleAiKeyPreviews: string[];
  imageProvider: string;
  snapgenApiKey: string;
  snapgenBaseUrl: string;
  snapgenModel: string;
  hasKey: boolean;
  hasGoogleAiKeys: boolean;
  googleAiKeyCount: number;
  hasSnapgenKey: boolean;
  hasGoogleKeys: boolean;
  hasPinterestKeys: boolean;
};

function maskGoogleAiKeyClient(key: string) {
  const trimmed = key.trim();
  if (!trimmed) return "";
  const last4 = trimmed.slice(-4);
  const prefix = trimmed.startsWith("AIza")
    ? "AIza"
    : trimmed.slice(0, Math.min(4, Math.max(0, trimmed.length - 4)));
  return `${prefix}${"•".repeat(8)}${last4}`;
}

const defaults: Settings = {
  isAdmin: false,
  model: "openai/gpt-4o-mini",
  imageModel: "x-ai/grok-2-image",
  rewriteStyle: "professional",
  articleLength: "similar",
  seoLevel: "high",
  imageStyle: "photorealistic",
  imageSystemPrompt:
    "Create a high-quality, realistic image with no text, logos, or watermarks. Focus on clear subject composition and professional lighting.",
  language: "en",
  toneOfVoice: "informative",
  dailyImageLimit: 50,
  pinsPerArticle: 3,
  boardsPerArticle: 1,
  articlePostTimes: [],
  pinPostTimes: [],
  defaultSchedule: "HOURLY",
  scheduleHour: 9,
  postingDays: "mon,tue,wed,thu,fri,sat,sun",
  postingHoursByDay: {},
  scheduleWindowStart: null,
  scheduleWindowEnd: null,
  defaultDailyLimit: 2,
  openRouterKey: "",
  googleClientId: "",
  googleClientSecret: "",
  googleRedirectUri: "",
  pinterestAppId: "",
  pinterestAppSecret: "",
  pinterestRedirectUri: "",
  contentProvider: "openrouter",
  googleAiModel: "gemini-2.0-flash",
  googleAiKeyPreviews: [],
  imageProvider: "openrouter",
  snapgenApiKey: "",
  snapgenBaseUrl: "https://api.snapgen.ai",
  snapgenModel: "imagen-flash",
  hasKey: false,
  hasGoogleAiKeys: false,
  googleAiKeyCount: 0,
  hasSnapgenKey: false,
  hasGoogleKeys: false,
  hasPinterestKeys: false,
};

function SecretField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
      {label}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input-field"
          style={{ fontWeight: 400 }}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="button"
          className="btn-secondary"
          style={{ flexShrink: 0, fontSize: 13, padding: "0.65rem 1rem" }}
          onClick={() => setShow((v) => !v)}
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {hint && (
        <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>{hint}</span>
      )}
    </label>
  );
}

function SettingsForm() {
  const [settings, setSettings] = useState<Settings>(defaults);
  const [saved, setSaved] = useState(false);
  const [applyDailyLimitToBlogs, setApplyDailyLimitToBlogs] = useState(false);
  const [googleAiKeepIndices, setGoogleAiKeepIndices] = useState<number[]>([]);
  const [googleAiPendingAdds, setGoogleAiPendingAdds] = useState<string[]>([]);
  const [newGoogleAiKey, setNewGoogleAiKey] = useState("");
  const [showNewGoogleAiKey, setShowNewGoogleAiKey] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  function applyGoogleAiKeyState(data: Partial<Settings> & { googleAiKeyPreviews?: string[] }) {
    const previews = Array.isArray(data.googleAiKeyPreviews) ? data.googleAiKeyPreviews : [];
    setGoogleAiKeepIndices(previews.map((_, i) => i));
    setGoogleAiPendingAdds([]);
    setNewGoogleAiKey("");
  }

  const googleAiDisplayRows = useMemo(() => {
    const existing = googleAiKeepIndices.map((index) => ({
      id: `existing-${index}`,
      kind: "existing" as const,
      index,
      preview: settings.googleAiKeyPreviews[index] || "••••••••",
    }));
    const pending = googleAiPendingAdds.map((key, i) => ({
      id: `pending-${i}`,
      kind: "pending" as const,
      index: i,
      preview: maskGoogleAiKeyClient(key),
    }));
    return [...existing, ...pending];
  }, [googleAiKeepIndices, googleAiPendingAdds, settings.googleAiKeyPreviews]);

  const googleAiConfiguredCount = googleAiDisplayRows.length;

  const enabledDays = useMemo(
    () => new Set(settings.postingDays.split(",").map((d) => d.trim()).filter(Boolean)),
    [settings.postingDays]
  );

  const articlesPerDay = Math.max(1, settings.defaultDailyLimit || 1);
  const pinsPerArticle = Math.max(1, settings.pinsPerArticle || 1);
  const pinSlotsPerDay = pinsPerArticle * articlesPerDay;

  const articleTimesConfigured = (settings.articlePostTimes?.length ?? 0) > 0;
  const pinTimesConfigured = (settings.pinPostTimes?.length ?? 0) > 0;

  const articleTimes = useMemo(() => {
    const existing = Array.isArray(settings.articlePostTimes) ? settings.articlePostTimes : [];
    if (existing.length === 0) return [];
    return resizePostTimes(existing, articlesPerDay);
  }, [settings.articlePostTimes, articlesPerDay]);

  const pinTimes = useMemo(() => {
    const existing = Array.isArray(settings.pinPostTimes) ? settings.pinPostTimes : [];
    if (existing.length === 0) return [];
    return resizePostTimes(existing, pinSlotsPerDay);
  }, [settings.pinPostTimes, pinSlotsPerDay]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        const next = {
          ...defaults,
          ...data,
          googleAiKeyPreviews: Array.isArray(data.googleAiKeyPreviews) ? data.googleAiKeyPreviews : [],
          postingHoursByDay: data.postingHoursByDay || {},
          articlePostTimes: Array.isArray(data.articlePostTimes) ? data.articlePostTimes : [],
          pinPostTimes: Array.isArray(data.pinPostTimes) ? data.pinPostTimes : [],
        };
        setSettings(next);
        applyGoogleAiKeyState(next);
      })
      .catch(console.error);
  }, []);

  function addGoogleAiKey() {
    const key = newGoogleAiKey.trim();
    if (!key || key.includes("•")) return;
    setGoogleAiPendingAdds((prev) => [...prev, key]);
    setNewGoogleAiKey("");
    setShowNewGoogleAiKey(false);
  }

  function removeGoogleAiRow(row: { kind: "existing" | "pending"; index: number }) {
    if (row.kind === "existing") {
      setGoogleAiKeepIndices((prev) => prev.filter((i) => i !== row.index));
      return;
    }
    setGoogleAiPendingAdds((prev) => prev.filter((_, i) => i !== row.index));
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSaved(false);
    if (pwNew !== pwConfirm) {
      setPwError("New passwords do not match.");
      return;
    }
    const res = await fetch("/api/account/password", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPwError(data.error || "Could not change password");
      return;
    }
    setPwCurrent("");
    setPwNew("");
    setPwConfirm("");
    setPwSaved(true);
    setTimeout(() => setPwSaved(false), 2000);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const { googleAiKeyPreviews: _, ...rest } = settings;
    void _;
    const payload = {
      ...rest,
      articlePostTimes: articleTimes,
      pinPostTimes: pinTimes,
      applyDailyLimitToBlogs,
      googleAiKeysEdit: {
        keepIndices: googleAiKeepIndices,
        add: googleAiPendingAdds,
      },
    };
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    const next = {
      ...defaults,
      ...data,
      googleAiKeyPreviews: Array.isArray(data.googleAiKeyPreviews) ? data.googleAiKeyPreviews : [],
      postingHoursByDay: data.postingHoursByDay || {},
      articlePostTimes: Array.isArray(data.articlePostTimes) ? data.articlePostTimes : [],
      pinPostTimes: Array.isArray(data.pinPostTimes) ? data.pinPostTimes : [],
    };
    setSettings(next);
    applyGoogleAiKeyState(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function field(
    key: keyof Settings,
    label: string,
    opts?: { type?: string; placeholder?: string; hint?: string }
  ) {
    const type = opts?.type ?? "text";
    return (
      <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
        {label}
        <input
          className="input-field"
          style={{ fontWeight: 400 }}
          type={type}
          value={String(settings[key] ?? "")}
          placeholder={opts?.placeholder}
          onChange={(e) =>
            setSettings((s) => ({
              ...s,
              [key]: type === "number" ? Number(e.target.value) : e.target.value,
            }))
          }
        />
        {opts?.hint && (
          <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>{opts.hint}</span>
        )}
      </label>
    );
  }

  function selectField(
    key: keyof Settings,
    label: string,
    options: Array<{ value: string; label: string }>
  ) {
    return (
      <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
        {label}
        <select
          className="input-field"
          style={{ fontWeight: 400 }}
          value={String(settings[key] ?? "")}
          onChange={(e) => setSettings((s) => ({ ...s, [key]: e.target.value }))}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function toggleDay(day: WeekdayKey) {
    const next = new Set(enabledDays);
    if (next.has(day)) next.delete(day);
    else next.add(day);
    const ordered = WEEKDAYS.map((d) => d.key).filter((k) => next.has(k));
    setSettings((s) => ({ ...s, postingDays: ordered.join(",") }));
  }

  function setDayHour(day: WeekdayKey, hour: number) {
    setSettings((s) => ({
      ...s,
      postingHoursByDay: { ...s.postingHoursByDay, [day]: hour },
    }));
  }

  function applyHourToAllDays() {
    const hours: Partial<Record<WeekdayKey, number>> = {};
    for (const d of WEEKDAYS) hours[d.key] = settings.scheduleHour;
    setSettings((s) => ({ ...s, postingHoursByDay: hours }));
  }

  function setArticleTime(index: number, value: string) {
    const next = [...articleTimes];
    next[index] = value;
    setSettings((s) => ({ ...s, articlePostTimes: next }));
  }

  function setPinTime(index: number, value: string) {
    const next = [...pinTimes];
    next[index] = value;
    setSettings((s) => ({ ...s, pinPostTimes: next }));
  }

  function autoSpreadArticleTimes() {
    setSettings((s) => ({
      ...s,
      articlePostTimes: spreadPostTimesEvenly(articlesPerDay, "09:00", "15:00"),
    }));
  }

  function clearArticleTimes() {
    setSettings((s) => ({ ...s, articlePostTimes: [] }));
  }

  function autoSpreadPinTimes() {
    setSettings((s) => ({
      ...s,
      pinPostTimes: spreadPostTimesEvenly(pinSlotsPerDay, "09:30", "18:00"),
    }));
  }

  function clearPinTimes() {
    setSettings((s) => ({ ...s, pinPostTimes: [] }));
  }

  const sectionTitle: CSSProperties = {
    margin: "0 0 4px",
    fontFamily: "var(--font-display), system-ui, sans-serif",
    fontSize: "1.15rem",
    fontWeight: 700,
    color: "var(--ink)",
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="API keys, publishing rules, schedule, and image generation prompts."
      />

      {error === "google_keys" && (
        <p style={{ color: "var(--pin)", marginBottom: 16 }}>
          {settings.isAdmin ? (
            <>
              Add the Google Client ID and Secret below before connecting Blogger.{" "}
              <Link href="/dashboard/tutorials/google" style={{ fontWeight: 600, textDecoration: "underline" }}>
                View Google setup tutorial
              </Link>
            </>
          ) : (
            "Google OAuth is not configured yet. Ask an admin to add the Google Cloud app credentials."
          )}
        </p>
      )}
      {error === "pinterest_keys" && (
        <p style={{ color: "var(--pin)", marginBottom: 16 }}>
          {settings.isAdmin ? (
            <>
              Add your Pinterest App ID and Secret below before connecting Pinterest.{" "}
              <Link href="/dashboard/tutorials/pinterest" style={{ fontWeight: 600, textDecoration: "underline" }}>
                View Pinterest setup tutorial
              </Link>
            </>
          ) : (
            "Pinterest OAuth is not configured yet. Ask an admin to add the Pinterest app credentials."
          )}
        </p>
      )}

      <p
        style={{
          margin: "0 0 16px",
          fontSize: 13,
          color: "var(--ink-soft)",
          padding: "0.75rem 1rem",
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "rgba(255,255,255,0.45)",
        }}
      >
        API keys and OAuth secrets are encrypted at rest. Masked values mean a key is already saved —
        leave them unchanged unless you want to replace them.
      </p>

      <form onSubmit={changePassword} style={{ display: "grid", gap: 16, maxWidth: 760, marginBottom: 16 }}>
        <Panel>
          <h2 style={{ ...sectionTitle, marginBottom: 14 }}>Account password</h2>
          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
              Current password
              <input
                className="input-field"
                type="password"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
              New password
              <input
                className="input-field"
                type="password"
                value={pwNew}
                onChange={(e) => setPwNew(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
              Confirm new password
              <input
                className="input-field"
                type="password"
                value={pwConfirm}
                onChange={(e) => setPwConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button type="submit" className="btn-primary">
                Change password
              </button>
              {pwSaved && <span style={{ color: "var(--success)", fontSize: 13, fontWeight: 600 }}>Password updated</span>}
              {pwError && <span style={{ color: "var(--pin)", fontSize: 13 }}>{pwError}</span>}
            </div>
          </div>
        </Panel>
      </form>

      <form onSubmit={save} style={{ display: "grid", gap: 16, maxWidth: 760 }}>
        <Panel>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <h2 style={sectionTitle}>OpenRouter</h2>
            <StatusBadge ok={settings.hasKey} />
          </div>
          <SecretField
            label="API key"
            value={settings.openRouterKey}
            onChange={(v) => setSettings((s) => ({ ...s, openRouterKey: v }))}
            placeholder="sk-or-v1-…"
            hint="Your personal key for LLM rewrite and optional image generation. Not shared with other users."
          />
        </Panel>

        <Panel>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <h2 style={sectionTitle}>Content writer</h2>
            <StatusBadge
              ok={
                settings.contentProvider === "openrouter"
                  ? settings.hasKey
                  : googleAiConfiguredCount > 0
              }
              okLabel={
                settings.contentProvider === "google_ai_studio"
                  ? `Configured (${googleAiConfiguredCount})`
                  : "Configured"
              }
            />
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            {selectField("contentProvider", "Provider", [
              { value: "openrouter", label: "OpenRouter" },
              { value: "google_ai_studio", label: "Google AI Studio" },
            ])}
            {field("model", "OpenRouter LLM model")}
            {field("googleAiModel", "Google AI Studio model")}

            <div style={{ display: "grid", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                  Google AI Studio API keys
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <span
                    className="surface"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "0.35rem 0.75rem",
                      borderRadius: 999,
                      color: "var(--ink)",
                    }}
                  >
                    {googleAiConfiguredCount} key{googleAiConfiguredCount === 1 ? "" : "s"} configured
                  </span>
                  <span
                    className="surface"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      padding: "0.35rem 0.75rem",
                      borderRadius: 999,
                      color: "var(--ink-soft)",
                    }}
                  >
                    Rotates on quota
                  </span>
                </div>
              </div>

              {googleAiDisplayRows.length === 0 ? (
                <div
                  className="surface"
                  style={{
                    padding: "1rem 1.1rem",
                    borderRadius: 14,
                    fontSize: 13,
                    color: "var(--ink-soft)",
                  }}
                >
                  No API keys yet. Add a Google AI Studio key below — it will be encrypted at rest.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {googleAiDisplayRows.map((row) => (
                    <div
                      key={row.id}
                      className="surface"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "0.75rem 1rem",
                        borderRadius: 14,
                      }}
                    >
                      <code
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: "var(--ink)",
                          letterSpacing: "0.02em",
                          wordBreak: "break-all",
                        }}
                      >
                        {row.preview}
                      </code>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ flexShrink: 0, fontSize: 12, padding: "0.45rem 0.9rem" }}
                        onClick={() => removeGoogleAiRow(row)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  className="input-field"
                  style={{ flex: "1 1 220px", fontWeight: 400, fontFamily: "monospace" }}
                  type={showNewGoogleAiKey ? "text" : "password"}
                  value={newGoogleAiKey}
                  onChange={(e) => setNewGoogleAiKey(e.target.value)}
                  placeholder="AIza…"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addGoogleAiKey();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flexShrink: 0, fontSize: 13, padding: "0.65rem 1rem" }}
                  onClick={() => setShowNewGoogleAiKey((v) => !v)}
                >
                  {showNewGoogleAiKey ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flexShrink: 0, fontSize: 13, padding: "0.65rem 1.1rem" }}
                  onClick={addGoogleAiKey}
                  disabled={!newGoogleAiKey.trim()}
                >
                  Add
                </button>
              </div>
              <span style={{ fontSize: 12, fontWeight: 400, color: "var(--ink-soft)" }}>
                Keys are encrypted at rest. Leave the list unchanged to keep existing keys when saving.
              </span>
            </div>
          </div>
        </Panel>

        {settings.isAdmin ? (
        <>
        <Panel>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <h2 style={sectionTitle}>Google (Blogger OAuth)</h2>
            <StatusBadge ok={settings.hasGoogleKeys} />
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-soft)" }}>
            Shared Google Cloud OAuth app. Every user connects their own Google/Blogger account with this app.
            Keys are stored here only — they are not read from <code>.env</code>.
          </p>
          {!settings.hasGoogleKeys && (
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--pin)", fontWeight: 600 }}>
              Add Client ID and Client Secret below. Connect Google will not work until these are saved in Settings.
            </p>
          )}
          <div style={{ display: "grid", gap: 14 }}>
            {field("googleClientId", "Client ID", {
              placeholder: "1234567890-xxxxx.apps.googleusercontent.com",
              hint: "From Google Cloud Console → Credentials (OAuth client). Not an email address.",
            })}
            <SecretField
              label="Client secret"
              value={settings.googleClientSecret}
              onChange={(v) => setSettings((s) => ({ ...s, googleClientSecret: v }))}
              placeholder="GOCSPX-…"
            />
            {field("googleRedirectUri", "Redirect URI (exact value used)", {
              hint: "Add this exact URI in Google Cloud Console → Authorized redirect URIs. Production: https://pinmaster.site/api/oauth/google/callback. Leave blank to use NEXTAUTH_URL automatically; stale localhost is ignored when NEXTAUTH_URL is production.",
            })}
            {settings.googleRedirectUri ? (
              <code
                style={{
                  display: "block",
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  background: "var(--paper-deep)",
                  color: "var(--ink)",
                  fontSize: 13,
                  wordBreak: "break-all",
                }}
              >
                {settings.googleRedirectUri}
              </code>
            ) : null}
            <Link href="/dashboard/tutorials/google" style={{ fontSize: 13, fontWeight: 600, color: "var(--pin)" }}>
              Google OAuth setup tutorial →
            </Link>
          </div>
        </Panel>

        <Panel>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <h2 style={sectionTitle}>Pinterest OAuth</h2>
            <StatusBadge ok={settings.hasPinterestKeys} />
          </div>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-soft)" }}>
            Shared Pinterest developer app. Keys are stored here only — they are not read from <code>.env</code>.
          </p>
          {!settings.hasPinterestKeys && (
            <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--pin)", fontWeight: 600 }}>
              Add App ID and App Secret below. Connect Pinterest will not work until these are saved in Settings.
            </p>
          )}
          <div style={{ display: "grid", gap: 14 }}>
            {field("pinterestAppId", "App ID", {
              placeholder: "148…",
              hint: "Numeric App ID from developers.pinterest.com/apps",
            })}
            <SecretField
              label="App secret"
              value={settings.pinterestAppSecret}
              onChange={(v) => setSettings((s) => ({ ...s, pinterestAppSecret: v }))}
              placeholder="Your Pinterest app secret"
            />
            {field("pinterestRedirectUri", "Redirect URI (exact value used)", {
              hint: "Add this exact URI in the Pinterest developer portal. Production: https://pinmaster.site/api/oauth/pinterest/callback. Leave blank to use NEXTAUTH_URL automatically; stale localhost is ignored when NEXTAUTH_URL is production.",
            })}
            {settings.pinterestRedirectUri ? (
              <code
                style={{
                  display: "block",
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  background: "var(--paper-deep)",
                  color: "var(--ink)",
                  fontSize: 13,
                  wordBreak: "break-all",
                }}
              >
                {settings.pinterestRedirectUri}
              </code>
            ) : null}
            <Link href="/dashboard/tutorials/pinterest" style={{ fontSize: 13, fontWeight: 600, color: "var(--pin)" }}>
              Pinterest app setup tutorial →
            </Link>
          </div>
        </Panel>
        </>
        ) : (
          <Panel>
            <h2 style={{ ...sectionTitle, marginBottom: 8 }}>Google & Pinterest apps</h2>
            <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>
              OAuth app credentials are configured by an admin in Settings. You only connect your own
              Google/Blogger and Pinterest accounts. Status:{" "}
              {settings.hasGoogleKeys ? "Google app ready" : "Google app not configured — ask an admin to add keys in Settings"} ·{" "}
              {settings.hasPinterestKeys ? "Pinterest app ready" : "Pinterest app not configured — ask an admin to add keys in Settings"}.
            </p>
          </Panel>
        )}

        <Panel>
          <h2 style={{ ...sectionTitle, marginBottom: 8 }}>Publishing & Pinterest</h2>
          <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--ink-soft)" }}>
            You post{" "}
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>{articlesPerDay} articles</span> and{" "}
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>{pinSlotsPerDay} pins</span> per day
            ({pinsPerArticle} pins × {articlesPerDay} articles) — set the clock time for each.
            Times use the <span style={{ color: "var(--ink)", fontWeight: 600 }}>server local timezone</span>.
            If times are not set, posts go out immediately when ready (previous behavior).
          </p>
          <div style={{ display: "grid", gap: 14 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              {field("pinsPerArticle", "Pins per article", {
                type: "number",
                hint: "How many pins to generate and publish per article (e.g. 3).",
              })}
              {field("boardsPerArticle", "Boards per article", {
                type: "number",
                hint: "Use 1 to keep all pins on the mapped board. >1 distributes across boards.",
              })}
              {field("defaultDailyLimit", "Articles per day (per website)", {
                type: "number",
                hint: "Maps to each blog’s dailyLimit. Check the box below to sync all blogs (e.g. 2).",
              })}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-soft)" }}>
              <input
                type="checkbox"
                checked={applyDailyLimitToBlogs}
                onChange={(e) => setApplyDailyLimitToBlogs(e.target.checked)}
              />
              Apply articles/day to all existing blogs on save
            </label>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid var(--line)",
                background: "rgba(255,255,255,0.35)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                  Article posting times ({articlesPerDay} slots)
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={autoSpreadArticleTimes}
                  >
                    {articleTimesConfigured ? "Auto-spread 09:00–15:00" : "Set times (auto-spread)"}
                  </button>
                  {articleTimesConfigured && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 12 }}
                      onClick={clearArticleTimes}
                    >
                      Clear (immediate)
                    </button>
                  )}
                </div>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ink-soft)" }}>
                Article 1 publishes at the first time, article 2 at the second, and so on (within your daily limit).
              </p>
              {!articleTimesConfigured ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>
                  Not set — articles publish as soon as they are ready.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 10,
                  }}
                >
                  {articleTimes.map((time, index) => (
                    <label
                      key={`article-time-${index}`}
                      style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}
                    >
                      Article {index + 1}
                      <input
                        className="input-field"
                        type="time"
                        value={time}
                        onChange={(e) => setArticleTime(index, e.target.value)}
                        style={{ fontWeight: 400 }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid var(--line)",
                background: "rgba(255,255,255,0.35)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>
                  Pin posting times ({pinSlotsPerDay} pin slots today)
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 12 }}
                    onClick={autoSpreadPinTimes}
                  >
                    {pinTimesConfigured ? "Auto-spread 09:30–18:00" : "Set times (auto-spread)"}
                  </button>
                  {pinTimesConfigured && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 12 }}
                      onClick={clearPinTimes}
                    >
                      Clear (immediate)
                    </button>
                  )}
                </div>
              </div>
              <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ink-soft)" }}>
                Pin 1–{pinSlotsPerDay} each get their own clock time so pins are not dumped all at once after an article publishes.
              </p>
              {!pinTimesConfigured ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--ink-soft)" }}>
                  Not set — all pins for an article publish immediately after Blogger.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                    gap: 10,
                  }}
                >
                  {pinTimes.map((time, index) => (
                    <label
                      key={`pin-time-${index}`}
                      style={{ display: "grid", gap: 6, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}
                    >
                      Pin {index + 1}
                      <input
                        className="input-field"
                        type="time"
                        value={time}
                        onChange={(e) => setPinTime(index, e.target.value)}
                        style={{ fontWeight: 400 }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectField("defaultSchedule", "Default crawl schedule", [
              { value: "EVERY_15_MIN", label: "Every 15 minutes" },
              { value: "HOURLY", label: "Every hour" },
              { value: "EVERY_6_HOURS", label: "Every 6 hours" },
              { value: "DAILY", label: "Daily" },
              { value: "MANUAL", label: "Manual only" },
            ])}
            {field("scheduleHour", "Default preferred hour (0–23)", {
              type: "number",
              hint: "Used for daily schedules and as the fallback when a weekday has no custom hour.",
            })}
            <button type="button" className="btn-secondary" style={{ width: "fit-content", fontSize: 13 }} onClick={applyHourToAllDays}>
              Apply default hour to all weekdays
            </button>

            <div>
              <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                Posting days & preferred hours
              </p>
              <div style={{ display: "grid", gap: 8 }}>
                {WEEKDAYS.map((day) => (
                  <div
                    key={day.key}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr 100px",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink)" }}>
                      <input
                        type="checkbox"
                        checked={enabledDays.has(day.key)}
                        onChange={() => toggleDay(day.key)}
                      />
                      {day.label}
                    </label>
                    <span style={{ fontSize: 12, color: "var(--ink-soft)" }}>Preferred hour</span>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      max={23}
                      disabled={!enabledDays.has(day.key)}
                      value={settings.postingHoursByDay[day.key] ?? settings.scheduleHour}
                      onChange={(e) => setDayHour(day.key, Number(e.target.value))}
                      style={{ fontWeight: 400 }}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                Window start (optional)
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  max={23}
                  value={settings.scheduleWindowStart ?? ""}
                  placeholder="e.g. 8"
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      scheduleWindowStart: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  style={{ fontWeight: 400 }}
                />
              </label>
              <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
                Window end (optional)
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  max={23}
                  value={settings.scheduleWindowEnd ?? ""}
                  placeholder="e.g. 20"
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      scheduleWindowEnd: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  style={{ fontWeight: 400 }}
                />
              </label>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--ink-soft)" }}>
              Leave window empty for no restriction. When set, crawls/publishes only run inside the window
              (end hour exclusive; overnight windows supported).
            </p>
          </div>
        </Panel>

        <Panel>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
            <h2 style={sectionTitle}>Image generation</h2>
            <StatusBadge
              ok={settings.imageProvider === "snapgen" ? settings.hasSnapgenKey : settings.hasKey}
              okLabel={settings.imageProvider === "snapgen" ? "SnapGen ready" : "OpenRouter ready"}
            />
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            {selectField("imageProvider", "Provider", [
              { value: "openrouter", label: "OpenRouter (Grok Image)" },
              { value: "snapgen", label: "SnapGen AI" },
            ])}
            {field("imageModel", "OpenRouter image model")}
            <SecretField
              label="SnapGen API key"
              value={settings.snapgenApiKey}
              onChange={(v) => setSettings((s) => ({ ...s, snapgenApiKey: v }))}
              placeholder="sg-…"
            />
            {field("snapgenBaseUrl", "SnapGen base URL")}
            {field("snapgenModel", "SnapGen model", { placeholder: "imagen-flash" })}
            {field("imageStyle", "Image style")}
            <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
              System prompt
              <textarea
                className="input-field"
                value={settings.imageSystemPrompt}
                onChange={(e) => setSettings((s) => ({ ...s, imageSystemPrompt: e.target.value }))}
                rows={5}
                style={{ resize: "vertical", minHeight: 110, fontWeight: 400 }}
              />
            </label>
            {field("dailyImageLimit", "Daily image limit", { type: "number" })}
          </div>
        </Panel>

        <Panel>
          <h2 style={{ ...sectionTitle, marginBottom: 14 }}>AI rewrite behavior</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {field("rewriteStyle", "Rewrite style")}
            {field("toneOfVoice", "Tone of voice")}
            {field("language", "Language")}
            {field("articleLength", "Article length (similar / longer / shorter)")}
            {field("seoLevel", "SEO level")}
          </div>
        </Panel>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="submit" className="btn-primary">
            Save settings
          </button>
          {saved && <span style={{ color: "var(--success)", fontSize: 13, fontWeight: 600 }}>Saved</span>}
        </div>
      </form>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<p style={{ color: "var(--ink-soft)" }}>Loading settings…</p>}>
      <SettingsForm />
    </Suspense>
  );
}
