export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="animate-rise"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: 16,
        marginBottom: 28,
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "1.85rem",
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            style={{
              margin: "10px 0 0",
              color: "var(--ink-soft)",
              maxWidth: 560,
              lineHeight: 1.5,
              fontSize: 15,
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="surface animate-rise"
      style={{
        padding: "1.35rem 1.4rem",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Panel>
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
        {label}
      </p>
      <p
        style={{
          margin: "10px 0 0",
          fontSize: "1.85rem",
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 700,
          color: "var(--ink)",
        }}
      >
        {value}
      </p>
    </Panel>
  );
}

export const btnPrimary: React.CSSProperties = {
  background: "var(--pin)",
  color: "#ffffff",
  border: "none",
  borderRadius: 999,
  padding: "0.7rem 1.25rem",
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};

export const btnGhost: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.55)",
  color: "var(--ink)",
  border: "1px solid var(--line)",
  borderRadius: 999,
  padding: "0.6rem 1rem",
  cursor: "pointer",
  fontWeight: 600,
};

export const inputStyle: React.CSSProperties = {
  background: "rgba(255, 255, 255, 0.72)",
  border: "1px solid var(--line)",
  borderRadius: 12,
  padding: "0.85rem 1rem",
  color: "var(--ink)",
  width: "100%",
  outline: "none",
};

export function statusColor(status: string) {
  if (status === "COMPLETED" || status === "completed") return "var(--success)";
  if (status === "FAILED" || status === "failed") return "var(--danger)";
  if (status === "ACTIVE" || status === "QUEUED") return "var(--warn)";
  return "var(--ink-soft)";
}

export function StatusBadge({
  ok,
  okLabel = "Configured",
  missingLabel = "Missing",
}: {
  ok: boolean;
  okLabel?: string;
  missingLabel?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        padding: "0.28rem 0.65rem",
        borderRadius: 999,
        background: ok ? "rgba(31, 111, 91, 0.12)" : "rgba(230, 0, 35, 0.1)",
        color: ok ? "var(--success)" : "var(--pin)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: "currentColor",
        }}
      />
      {ok ? okLabel : missingLabel}
    </span>
  );
}
