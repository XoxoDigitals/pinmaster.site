import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SiteFooter } from "@/components/SiteFooter";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  const params = await searchParams;

  return (
    <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
      <header style={{ borderBottom: "1px solid var(--line)", padding: "1rem 1.5rem" }}>
        <div style={{ margin: "0 auto", maxWidth: 72 * 16, display: "flex", justifyContent: "space-between" }}>
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
        </div>
      </header>

      <main
        className="animate-rise"
        style={{
          margin: "0 auto",
          width: "100%",
          maxWidth: 28 * 16,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "3.5rem 1.5rem",
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--pin)" }}>Welcome back</p>
        <h1
          style={{
            margin: "8px 0 0",
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: "2.25rem",
            fontWeight: 700,
            color: "var(--ink)",
          }}
        >
          Log in
        </h1>
        <p style={{ margin: "12px 0 0", fontSize: 14, color: "var(--ink-soft)" }}>
          Access Blogger, Pinterest, and AI publishing.
        </p>

        <LoginForm initialError={params.error} />

        <p style={{ marginTop: 20, fontSize: 13, color: "var(--ink-soft)" }}>
          Default after seed: admin@example.com / changeme123
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
