import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

function maybeDecrypt(value?: string | null): string {
  if (!value) return "";
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

export type GoogleAppCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type PinterestAppCredentials = {
  appId: string;
  appSecret: string;
  redirectUri: string;
};

const APP_CONFIG_ID = "default";

export async function getAppConfig() {
  return prisma.appConfig.findUnique({ where: { id: APP_CONFIG_ID } });
}

export async function ensureAppConfig() {
  return prisma.appConfig.upsert({
    where: { id: APP_CONFIG_ID },
    update: {},
    create: { id: APP_CONFIG_ID },
  });
}

export async function getGoogleAppCredentials(
  _userId?: string | null
): Promise<GoogleAppCredentials> {
  const config = await prisma.appConfig.findUnique({ where: { id: APP_CONFIG_ID } });

  return {
    clientId: config?.googleClientId || process.env.GOOGLE_CLIENT_ID || "",
    clientSecret:
      maybeDecrypt(config?.googleClientSecret) ||
      process.env.GOOGLE_CLIENT_SECRET ||
      "",
    redirectUri:
      config?.googleRedirectUri ||
      process.env.GOOGLE_REDIRECT_URI ||
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/oauth/google/callback`,
  };
}

export async function getPinterestAppCredentials(
  _userId?: string | null
): Promise<PinterestAppCredentials> {
  const config = await prisma.appConfig.findUnique({ where: { id: APP_CONFIG_ID } });

  return {
    appId: config?.pinterestAppId || process.env.PINTEREST_APP_ID || "",
    appSecret:
      maybeDecrypt(config?.pinterestAppSecret) ||
      process.env.PINTEREST_APP_SECRET ||
      "",
    redirectUri:
      config?.pinterestRedirectUri ||
      process.env.PINTEREST_REDIRECT_URI ||
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/oauth/pinterest/callback`,
  };
}
