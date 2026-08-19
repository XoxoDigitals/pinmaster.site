import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui";

const REDIRECT = "/api/oauth/google/callback";

export default function GoogleTutorialPage() {
  return (
    <div>
      <PageHeader
        title="Google OAuth setup"
        description="Configure Google Cloud credentials so ContentOps can connect Blogger accounts."
        action={
          <Link href="/dashboard/settings" className="btn-secondary" style={{ fontSize: 13 }}>
            Open Settings
          </Link>
        }
      />

      <div style={{ display: "grid", gap: 16, maxWidth: 760 }}>
        <Panel>
          <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 16, color: "var(--ink-soft)", lineHeight: 1.6 }}>
            <li>
              <strong style={{ color: "var(--ink)" }}>Open Google Cloud Console</strong>
              <br />
              Go to{" "}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: "var(--pin)", fontWeight: 600 }}>
                console.cloud.google.com/apis/credentials
              </a>{" "}
              and select or create a project.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Enable Blogger API</strong>
              <br />
              Enable the Blogger API for your project under APIs &amp; Services.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Create an OAuth client</strong>
              <br />
              Create credentials → OAuth client ID → Application type: Web application. Name it ContentOps.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Add authorized redirect URI</strong>
              <br />
              Add exactly:
              <code
                style={{
                  display: "block",
                  marginTop: 8,
                  padding: "0.75rem 1rem",
                  borderRadius: 12,
                  background: "var(--paper-deep)",
                  color: "var(--ink)",
                  fontSize: 13,
                }}
              >
                {"{NEXTAUTH_URL}"}
                {REDIRECT}
              </code>
              <span style={{ display: "block", marginTop: 8, fontSize: 13 }}>
                Local default: <code>http://localhost:3000{REDIRECT}</code>
              </span>
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Copy Client ID and Client secret</strong>
              <br />
              Client ID looks like <code>123…apps.googleusercontent.com</code> — not an email. Paste both into
              Settings → Google (Blogger OAuth). Keep Redirect URI matching the value above.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Connect</strong>
              <br />
              Save settings, then open Blogger and click Connect Google.
            </li>
          </ol>
        </Panel>
        <Link href="/dashboard/tutorials" style={{ fontSize: 14, fontWeight: 600, color: "var(--pin)" }}>
          ← All tutorials
        </Link>
      </div>
    </div>
  );
}
