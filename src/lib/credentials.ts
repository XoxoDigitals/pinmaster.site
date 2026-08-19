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

function siteBaseUrl() {
  return process.env.NEXTAUTH_URL || "http://localhost:3000";
}

/** Google Cloud OAuth app — AppConfig (admin Settings) only. No .env fallback. */
export async function getGoogleAppCredentials(
  _userId?: string | null
): Promise<GoogleAppCredentials> {
  const config = await prisma.appConfig.findUnique({ where: { id: APP_CONFIG_ID } });

  return {
    clientId: (config?.googleClientId || "").trim(),
    clientSecret: maybeDecrypt(config?.googleClientSecret),
    redirectUri:
      (config?.googleRedirectUri || "").trim() ||
      `${siteBaseUrl()}/api/oauth/google/callback`,
  };
}

/** Pinterest developer app — AppConfig (admin Settings) only. No .env fallback. */
export async function getPinterestAppCredentials(
  _userId?: string | null
): Promise<PinterestAppCredentials> {
  const config = await prisma.appConfig.findUnique({ where: { id: APP_CONFIG_ID } });

  return {
    appId: (config?.pinterestAppId || "").trim(),
    appSecret: maybeDecrypt(config?.pinterestAppSecret),
    redirectUri:
      (config?.pinterestRedirectUri || "").trim() ||
      `${siteBaseUrl()}/api/oauth/pinterest/callback`,
  };
}
