import Link from "next/link";
import { PageHeader, Panel } from "@/components/ui";

const REDIRECT = "/api/oauth/pinterest/callback";
const PRODUCTION = `https://pinmaster.site${REDIRECT}`;

export default function PinterestTutorialPage() {
  return (
    <div>
      <PageHeader
        title="Pinterest app setup"
        description="Register an official Pinterest app and wire App ID, secret, and redirect URI into ContentOps."
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
              <strong style={{ color: "var(--ink)" }}>Open Pinterest Developers</strong>
              <br />
              Visit{" "}
              <a href="https://developers.pinterest.com/apps/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--pin)", fontWeight: 600 }}>
                developers.pinterest.com/apps
              </a>{" "}
              and create or select an app.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Configure redirect URI</strong>
              <br />
              Production must register exactly:
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
                {PRODUCTION}
              </code>
              <span style={{ display: "block", marginTop: 8, fontSize: 13 }}>
                Local development only: <code>http://localhost:3000{REDIRECT}</code>
              </span>
              <span style={{ display: "block", marginTop: 8, fontSize: 13 }}>
                Or use <code>{"{NEXTAUTH_URL}"}{REDIRECT}</code> matching your deploy. Settings shows the exact URI the app will send.
              </span>
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Copy App ID and App secret</strong>
              <br />
              Paste them into Settings → Pinterest OAuth. App ID is numeric; do not put an email in this field.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Scopes</strong>
              <br />
              Ensure the app can read/write boards and pins as required by your Pinterest developer configuration.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>Connect</strong>
              <br />
              Save settings, then open Pinterest in the dashboard and connect your account.
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
