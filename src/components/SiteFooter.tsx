import Link from "next/link";

export function SiteFooter() {
  return (
    <footer style={{ marginTop: "auto", borderTop: "1px solid var(--line)" }}>
      <div
        style={{
          margin: "0 auto",
          width: "100%",
          maxWidth: 72 * 16,
          display: "grid",
          gap: 32,
          padding: "2.5rem 1.5rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            ContentOps
          </p>
          <p style={{ margin: "8px 0 0", maxWidth: 280, fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5 }}>
            Automate Blogger publishing and Pinterest pins from reference sitemaps.
          </p>
        </div>
        <div style={{ display: "grid", gap: 8, fontSize: 14, color: "var(--ink-soft)" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>Product</p>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/dashboard/tutorials">Tutorials</Link>
          <Link href="/dashboard/settings">Settings</Link>
        </div>
        <div style={{ display: "grid", gap: 8, fontSize: 14, color: "var(--ink-soft)" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>Legal</p>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/cookies">Cookie Policy</Link>
        </div>
      </div>
    </footer>
  );
}
