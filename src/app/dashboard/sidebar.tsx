"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/blogs", label: "Blogger" },
  { href: "/dashboard/pinterest", label: "Pinterest" },
  { href: "/dashboard/sitemaps", label: "Sitemaps" },
  { href: "/dashboard/articles", label: "Articles" },
  { href: "/dashboard/logs", label: "Logs" },
  { href: "/dashboard/tutorials", label: "Tutorials" },
  { href: "/dashboard/settings", label: "Settings" },
];

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const nav = isAdmin
    ? [...links.slice(0, -1), { href: "/dashboard/users", label: "Users" }, links[links.length - 1]]
    : links;

  return (
    <aside
      className="surface"
      style={{
        width: 224,
        flexShrink: 0,
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        height: "fit-content",
        position: "sticky",
        top: 24,
        alignSelf: "flex-start",
      }}
    >
      <Link
        href="/dashboard"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: "1.25rem",
          fontWeight: 700,
          color: "var(--ink)",
          marginBottom: 4,
          display: "block",
        }}
      >
        ContentOps
      </Link>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ink-soft)" }}>
        Pin & publish studio
      </p>

      <nav
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {nav.map((link) => {
          const active =
            pathname === link.href ||
            (link.href !== "/dashboard" && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: "0.55rem 0.75rem",
                borderRadius: 12,
                background: active ? "var(--pin)" : "transparent",
                color: active ? "#fff" : "var(--ink-soft)",
                fontSize: 14,
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <button
        type="button"
        className="btn-secondary"
        onClick={() => signOut({ callbackUrl: "/login" })}
        style={{ marginTop: 12, width: "100%", fontSize: 13, padding: "0.65rem 1rem" }}
      >
        Sign out
      </button>
    </aside>
  );
}
