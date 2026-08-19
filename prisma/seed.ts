import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_ADMIN_EMAIL = "saboor@xoxodigitals.com";
const DEFAULT_ADMIN_PASSWORD = "PinMaster-ChangeMe-2026!";

async function main() {
  const envEmail = (process.env.ADMIN_EMAIL || "").trim();
  const email =
    !envEmail || envEmail.toLowerCase() === "admin@example.com"
      ? DEFAULT_ADMIN_EMAIL
      : envEmail;
  const envPassword = (process.env.ADMIN_PASSWORD || "").trim();
  const password =
    !envPassword || envPassword === "changeme123"
      ? DEFAULT_ADMIN_PASSWORD
      : envPassword;
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.user.findUnique({ where: { email } });
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      role: "ADMIN",
      disabled: false,
      ...(existing ? {} : { passwordHash, name: "Admin" }),
    },
    create: {
      email,
      passwordHash,
      name: "Admin",
      role: "ADMIN",
      aiSettings: { create: {} },
    },
  });

  if (!existing) {
    console.log(`Admin created: ${user.email}`);
    console.log(`Default password: ${password}`);
    console.log("Change this password after first login.");
  } else {
    console.log(`Admin ready: ${user.email} (password unchanged)`);
  }

  const config = await prisma.appConfig.findUnique({ where: { id: "default" } });
  if (!config) {
    const fromSettings = await prisma.aiSettings.findFirst({
      where: {
        OR: [
          { googleClientId: { not: null } },
          { googleClientSecret: { not: null } },
          { pinterestAppId: { not: null } },
          { pinterestAppSecret: { not: null } },
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    await prisma.appConfig.create({
      data: {
        id: "default",
        googleClientId: fromSettings?.googleClientId || process.env.GOOGLE_CLIENT_ID || null,
        googleClientSecret: fromSettings?.googleClientSecret || null,
        googleRedirectUri: fromSettings?.googleRedirectUri || process.env.GOOGLE_REDIRECT_URI || null,
        pinterestAppId: fromSettings?.pinterestAppId || process.env.PINTEREST_APP_ID || null,
        pinterestAppSecret: fromSettings?.pinterestAppSecret || null,
        pinterestRedirectUri:
          fromSettings?.pinterestRedirectUri || process.env.PINTEREST_REDIRECT_URI || null,
      },
    });
    console.log("AppConfig created (OAuth app keys migrated from AiSettings/env if present).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
