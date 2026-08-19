import type { ReactNode } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/SiteFooter";

export function PolicyLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid var(--line)",
          padding: "1rem 1.5rem",
        }}
      >
        <div
          style={{
            margin: "0 auto",
            maxWidth: 72 * 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            ContentOps
          </Link>
          <Link href="/login" className="btn-primary" style={{ padding: "0.55rem 1.1rem", fontSize: 13 }}>
            Log in
          </Link>
        </div>
      </header>
      <main
        style={{
          margin: "0 auto",
          width: "100%",
          maxWidth: 48 * 16,
          flex: 1,
          padding: "3.5rem 1.5rem",
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--pin)" }}>Legal</p>
        <h1
          style={{
            margin: "8px 0 0",
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "2.25rem",
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          {title}
        </h1>
        <p style={{ margin: "8px 0 0", fontSize: 14, color: "var(--ink-soft)" }}>
          Last updated: {updated}
        </p>
        <div
          className="prose-policy"
          style={{
            marginTop: 40,
            display: "grid",
            gap: 24,
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--ink-soft)",
          }}
        >
          {children}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
