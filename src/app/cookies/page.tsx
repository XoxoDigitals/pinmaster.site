import type { Metadata } from "next";
import { PolicyLayout } from "@/components/PolicyLayout";

export const metadata: Metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <PolicyLayout title="Cookie Policy" updated="August 10, 2026">
      <p>
        ContentOps uses essential cookies and session storage to keep you signed in and protect
        authenticated routes. We do not use advertising trackers by default.
      </p>
      <h2>Essential cookies</h2>
      <p>
        Authentication session cookies are required for dashboard access. Without them, you cannot
        stay logged in securely.
      </p>
      <h2>Preferences</h2>
      <p>
        Local UI preferences may be stored in your browser to improve convenience. Clearing site data
        removes these preferences.
      </p>
      <h2>Contact</h2>
      <p>Questions about cookies: privacy@contentops.app</p>
    </PolicyLayout>
  );
}
