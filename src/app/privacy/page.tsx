import type { Metadata } from "next";
import { PolicyLayout } from "@/components/PolicyLayout";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <PolicyLayout title="Privacy Policy" updated="August 10, 2026">
      <p>
        ContentOps helps you automate Blogger publishing and Pinterest pins using credentials and
        API keys you provide. This policy explains what information we handle and how it is used.
      </p>
      <h2>Information we store</h2>
      <p>
        Account credentials, OAuth tokens, encrypted API keys, blog and board mappings, sitemap
        sources, article drafts, and job logs are stored in your application database to operate the
        publishing pipeline. Secrets are encrypted at rest when saved through Settings.
      </p>
      <h2>How we use data</h2>
      <p>
        Credentials are used only to authenticate with Google, Pinterest, OpenRouter, Google AI
        Studio, SnapGen, and related services you configure, and to publish or schedule content you
        create. We do not sell personal data.
      </p>
      <h2>Third-party services</h2>
      <p>
        When you connect Google or Pinterest apps, those providers process authentication and
        publishing according to their own privacy policies and developer terms.
      </p>
      <h2>Your choices</h2>
      <p>
        You can update or clear API keys in Settings, disconnect OAuth accounts, and delete articles
        or sources from the dashboard. Contact your administrator if you need help exporting or
        deleting account data.
      </p>
      <h2>Contact</h2>
      <p>Questions about this policy: privacy@contentops.app</p>
    </PolicyLayout>
  );
}
