import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("UNAUTHORIZED");
  }
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.disabled) {
    throw new Error("UNAUTHORIZED");
  }
  return { ...session.user, role: dbUser.role, disabled: dbUser.disabled };
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new Error("FORBIDDEN");
  }
  return user;
}

export async function getSessionUser() {
  const session = await auth();
  return session?.user ?? null;
}

export async function ensureAiSettings(userId: string) {
  return prisma.aiSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });
}
