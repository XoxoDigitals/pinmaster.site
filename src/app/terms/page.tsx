import type { Metadata } from "next";
import { PolicyLayout } from "@/components/PolicyLayout";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <PolicyLayout title="Terms of Service" updated="August 10, 2026">
      <p>
        By using ContentOps you agree to use the platform responsibly, comply with Google, Pinterest,
        and other third-party developer terms, and keep your API credentials secure.
      </p>
      <h2>Service</h2>
      <p>
        ContentOps provides tools to crawl reference sitemaps, rewrite articles with AI, publish to
        Blogger, and create Pinterest pins. Features may change as the product evolves.
      </p>
      <h2>Your responsibilities</h2>
      <p>
        You are responsible for the content you publish, the accuracy of configured keys and OAuth
        apps, daily publishing limits, and compliance with applicable laws and platform policies.
      </p>
      <h2>Availability</h2>
      <p>
        We aim for reliable operation but do not guarantee uninterrupted service. Background workers
        and third-party APIs may experience delays or rate limits.
      </p>
      <h2>Contact</h2>
      <p>Questions about these terms: legal@contentops.app</p>
    </PolicyLayout>
  );
}
