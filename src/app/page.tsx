import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SiteFooter } from "@/components/SiteFooter";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
      <header style={{ borderBottom: "1px solid var(--line)", padding: "1rem 1.5rem" }}>
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
          <span
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "var(--ink)",
            }}
          >
            ContentOps
          </span>
          <Link href="/login" className="btn-primary" style={{ padding: "0.55rem 1.1rem", fontSize: 13 }}>
            Log in
          </Link>
        </div>
      </header>

      <main
        className="pin-grid"
        style={{
          flex: 1,
          display: "grid",
          alignContent: "center",
          position: "relative",
          overflow: "hidden",
          minHeight: "92vh",
        }}
      >
        <div
          aria-hidden
          className="animate-drift"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(900px 500px at 80% 0%, var(--glow), transparent 55%), radial-gradient(700px 420px at 0% 40%, rgba(31,111,91,0.12), transparent 50%)",
            pointerEvents: "none",
          }}
        />
        <section
          className="animate-rise"
          style={{
            maxWidth: 880,
            margin: "0 auto",
            padding: "4rem 1.5rem",
            position: "relative",
          }}
        >
          <p
            className="animate-rise"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: "clamp(3rem, 8vw, 5.5rem)",
              margin: 0,
              letterSpacing: "-0.04em",
              lineHeight: 0.98,
              fontWeight: 800,
              color: "var(--ink)",
            }}
          >
            ContentOps
          </p>
          <h1
            className="animate-rise-delay-1"
            style={{
              fontSize: "clamp(1.15rem, 2.4vw, 1.45rem)",
              fontWeight: 500,
              color: "var(--ink-soft)",
              margin: "1.35rem 0 0",
              maxWidth: 520,
              lineHeight: 1.55,
            }}
          >
            Crawl, rewrite, publish to Blogger, and grow traffic with Pinterest pins — from one calm studio.
          </h1>
          <div className="animate-rise-delay-2" style={{ marginTop: "2.25rem", display: "flex", gap: 12 }}>
            <Link href="/login" className="btn-primary">
              Open dashboard
            </Link>
            <Link href="/privacy" className="btn-secondary">
              Privacy
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
