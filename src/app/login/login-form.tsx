"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function LoginForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [error, setError] = useState(Boolean(initialError));
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "");
    const password = String(form.get("password") || "");

    setPending(true);
    setError(false);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(true);
      setPending(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <>
      {error && (
        <p
          style={{
            marginTop: 16,
            background: "rgba(230,0,35,0.1)",
            color: "var(--pin)",
            padding: "0.75rem 1rem",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          Invalid email or password.
        </p>
      )}

      <form onSubmit={onSubmit} className="surface" style={{ marginTop: 32, padding: 24, display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
          Email
          <input
            className="input-field"
            name="email"
            type="email"
            required
            autoComplete="email"
            defaultValue="admin@example.com"
            style={{ fontWeight: 400 }}
          />
        </label>
        <label style={{ display: "grid", gap: 8, fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>
          Password
          <input
            className="input-field"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            defaultValue="changeme123"
            style={{ fontWeight: 400 }}
          />
        </label>
        <button type="submit" className="btn-primary" style={{ width: "100%" }} disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </>
  );
}
