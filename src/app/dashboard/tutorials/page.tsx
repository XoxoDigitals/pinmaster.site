import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui";

export default function TutorialsPage() {
  return (
    <div>
      <PageHeader
        title="Tutorials"
        description="Step-by-step setup for Google Blogger OAuth and Pinterest app credentials."
      />
      <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
        <Panel>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--pin)" }}>
            Google
          </p>
          <h2
            style={{
              margin: "8px 0 0",
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "1.25rem",
              fontWeight: 700,
            }}
          >
            Connect Blogger with Google OAuth
          </h2>
          <p style={{ margin: "10px 0 16px", color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.5 }}>
            Create an OAuth client, set the redirect URI, and paste Client ID / Secret into Settings.
          </p>
          <Link href="/dashboard/tutorials/google" className="btn-primary" style={{ width: "fit-content" }}>
            Open Google tutorial
          </Link>
        </Panel>
        <Panel>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--pin)" }}>
            Pinterest
          </p>
          <h2
            style={{
              margin: "8px 0 0",
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "1.25rem",
              fontWeight: 700,
            }}
          >
            Connect Pinterest with an official app
          </h2>
          <p style={{ margin: "10px 0 16px", color: "var(--ink-soft)", fontSize: 14, lineHeight: 1.5 }}>
            Register a Pinterest developer app, add the redirect URI, and save App ID / Secret.
          </p>
          <Link href="/dashboard/tutorials/pinterest" className="btn-primary" style={{ width: "fit-content" }}>
            Open Pinterest tutorial
          </Link>
        </Panel>
      </div>
    </div>
  );
}
