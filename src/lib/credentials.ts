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

export type OAuthCredentialOptions = {
  /** Prefer request origin when env URL is missing; also used to override stale localhost AppConfig. */
  baseUrl?: string;
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

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/** True for localhost / 127.0.0.1 redirect URIs (often stale in production AppConfig). */
export function isLocalhostUrl(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(uri);
  }
}

/**
 * Site origin for OAuth redirects.
 * Order: NEXTAUTH_URL / AUTH_URL, else request origin, else localhost.
 * If env is stale localhost but the request host is production, prefer the request.
 */
export function siteBaseUrl(requestUrl?: string | URL): string {
  const fromEnv = (process.env.NEXTAUTH_URL || process.env.AUTH_URL || "").trim();
  let fromRequest = "";
  if (requestUrl) {
    try {
      const u = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
      fromRequest = normalizeBaseUrl(u.origin);
    } catch {
      /* ignore */
    }
  }

  if (fromEnv && fromRequest) {
    if (isLocalhostUrl(fromEnv) && !isLocalhostUrl(fromRequest)) {
      return fromRequest;
    }
    return normalizeBaseUrl(fromEnv);
  }
  if (fromEnv) return normalizeBaseUrl(fromEnv);
  if (fromRequest) return fromRequest;
  return "http://localhost:3000";
}

/**
 * Resolve OAuth redirect URI:
 * - Admin AppConfig value if set and not a stale localhost while production base is https
 * - Else `${baseUrl}${callbackPath}` from NEXTAUTH_URL / AUTH_URL / request
 */
export function resolveOAuthRedirectUri(
  configured: string | null | undefined,
  callbackPath: string,
  baseUrl?: string
): string {
  const base = normalizeBaseUrl(baseUrl || siteBaseUrl());
  const path = callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`;
  const derived = `${base}${path}`;
  const configuredTrimmed = (configured || "").trim();

  if (!configuredTrimmed) return derived;

  // Stale DB localhost while production (or request) base is non-local → prefer derived
  if (isLocalhostUrl(configuredTrimmed) && !isLocalhostUrl(derived)) {
    return derived;
  }

  return configuredTrimmed;
}

/** Google Cloud OAuth app — AppConfig (admin Settings) only. No .env fallback for keys. */
export async function getGoogleAppCredentials(
  _userId?: string | null,
  options?: OAuthCredentialOptions
): Promise<GoogleAppCredentials> {
  const config = await prisma.appConfig.findUnique({ where: { id: APP_CONFIG_ID } });

  return {
    clientId: (config?.googleClientId || "").trim(),
    clientSecret: maybeDecrypt(config?.googleClientSecret),
    redirectUri: resolveOAuthRedirectUri(
      config?.googleRedirectUri,
      "/api/oauth/google/callback",
      options?.baseUrl
    ),
  };
}

/** Pinterest developer app — AppConfig (admin Settings) only. No .env fallback for keys. */
export async function getPinterestAppCredentials(
  _userId?: string | null,
  options?: OAuthCredentialOptions
): Promise<PinterestAppCredentials> {
  const config = await prisma.appConfig.findUnique({ where: { id: APP_CONFIG_ID } });

  return {
    appId: (config?.pinterestAppId || "").trim(),
    appSecret: maybeDecrypt(config?.pinterestAppSecret),
    redirectUri: resolveOAuthRedirectUri(
      config?.pinterestRedirectUri,
      "/api/oauth/pinterest/callback",
      options?.baseUrl
    ),
  };
}
