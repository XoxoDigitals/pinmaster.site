import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/SiteFooter";
import { Sidebar } from "./sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!dbUser || dbUser.disabled) redirect("/login");

  return (
    <Providers session={session}>
      <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column" }}>
        <div
          style={{
            margin: "0 auto",
            width: "100%",
            maxWidth: 72 * 16,
            flex: 1,
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 24,
            padding: "2rem 1.5rem",
          }}
        >
          <Sidebar isAdmin={dbUser.role === "ADMIN"} />
          <section style={{ minWidth: 0, flex: 1 }}>{children}</section>
        </div>
        <SiteFooter />
      </div>
    </Providers>
  );
}
