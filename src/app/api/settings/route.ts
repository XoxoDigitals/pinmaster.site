import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import { ensureAiSettings } from "@/lib/session";
import { ensureAppConfig, getGoogleAppCredentials, getPinterestAppCredentials } from "@/lib/credentials";
import {
  decryptGoogleAiKeys,
  encryptGoogleAiKeys,
  maskGoogleAiKeyPreview,
  normalizeGoogleAiKeysInput,
} from "@/lib/google-ai";
import {
  parsePostingDays,
  parsePostingHoursByDay,
  parsePostTimes,
  resizePostTimes,
  serializePostingDays,
  serializePostingHoursByDay,
  serializePostTimes,
  WEEKDAYS,
  type WeekdayKey,
} from "@/lib/schedule";

const MASK = "••••••••";

function maskSecret(value?: string | null) {
  return value ? MASK : "";
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function safeClientId(value?: string | null) {
  const v = (value || "").trim();
  if (!v || looksLikeEmail(v)) return "";
  return v;
}

async function publicSettings(
  settings: Awaited<ReturnType<typeof ensureAiSettings>>,
  isAdmin: boolean
) {
  const googleKeys = decryptGoogleAiKeys(settings.googleAiStudioKeys);
  const appConfig = await ensureAppConfig();
  const google = await getGoogleAppCredentials();
  const pinterest = await getPinterestAppCredentials();
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";

  const oauth = isAdmin
    ? {
        googleClientId: safeClientId(appConfig.googleClientId),
        googleClientSecret: maskSecret(appConfig.googleClientSecret),
        googleRedirectUri:
          (appConfig.googleRedirectUri || "").trim() ||
          `${base}/api/oauth/google/callback`,
        pinterestAppId: (appConfig.pinterestAppId || "").trim(),
        pinterestAppSecret: maskSecret(appConfig.pinterestAppSecret),
        pinterestRedirectUri:
          (appConfig.pinterestRedirectUri || "").trim() ||
          `${base}/api/oauth/pinterest/callback`,
      }
    : {
        googleClientId: "",
        googleClientSecret: "",
        googleRedirectUri: "",
        pinterestAppId: "",
        pinterestAppSecret: "",
        pinterestRedirectUri: "",
      };

  return {
    ...settings,
    isAdmin,
    openRouterKey: maskSecret(settings.openRouterKey),
    ...oauth,
    googleAiStudioKeys: googleKeys.length ? MASK : "",
    googleAiKeyPreviews: googleKeys.map(maskGoogleAiKeyPreview),
    snapgenApiKey: maskSecret(settings.snapgenApiKey),
    postingDays: parsePostingDays(settings.postingDays).join(","),
    postingHoursByDay: parsePostingHoursByDay(settings.postingHoursByDay),
    scheduleWindowStart: settings.scheduleWindowStart ?? null,
    scheduleWindowEnd: settings.scheduleWindowEnd ?? null,
    defaultDailyLimit: settings.defaultDailyLimit ?? 5,
    articlePostTimes: parsePostTimes(settings.articlePostTimes),
    pinPostTimes: parsePostTimes(settings.pinPostTimes),
    hasKey: Boolean(settings.openRouterKey),
    hasGoogleAiKeys: googleKeys.length > 0,
    googleAiKeyCount: googleKeys.length,
    hasSnapgenKey: Boolean(settings.snapgenApiKey),
    hasGoogleKeys: Boolean(safeClientId(google.clientId) && google.clientSecret),
    hasPinterestKeys: Boolean(pinterest.appId && pinterest.appSecret),
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.disabled) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await ensureAiSettings(session.user.id);
  return NextResponse.json(await publicSettings(settings, dbUser.role === "ADMIN"));
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const data: Record<string, unknown> = {};

  for (const key of [
    "model",
    "imageModel",
    "rewriteStyle",
    "articleLength",
    "seoLevel",
    "imageStyle",
    "imageSystemPrompt",
    "language",
    "toneOfVoice",
    "defaultSchedule",
    "contentProvider",
    "googleAiModel",
    "imageProvider",
    "snapgenBaseUrl",
    "snapgenModel",
  ] as const) {
    if (body[key] !== undefined && body[key] !== MASK) {
      data[key] = body[key];
    }
  }

  if (data.contentProvider && !["openrouter", "google_ai_studio"].includes(String(data.contentProvider))) {
    return NextResponse.json({ error: "Invalid contentProvider" }, { status: 400 });
  }
  if (data.imageProvider && !["openrouter", "snapgen"].includes(String(data.imageProvider))) {
    return NextResponse.json({ error: "Invalid imageProvider" }, { status: 400 });
  }

  for (const key of [
    "dailyImageLimit",
    "pinsPerArticle",
    "boardsPerArticle",
    "scheduleHour",
    "defaultDailyLimit",
  ] as const) {
    if (typeof body[key] === "number" && Number.isFinite(body[key])) {
      data[key] = Math.max(0, Math.floor(body[key]));
    }
  }

  if (typeof data.pinsPerArticle === "number") {
    data.pinsPerArticle = Math.max(1, Math.min(20, data.pinsPerArticle as number));
  }
  if (typeof data.boardsPerArticle === "number") {
    data.boardsPerArticle = Math.max(1, Math.min(10, data.boardsPerArticle as number));
  }
  if (typeof data.scheduleHour === "number") {
    data.scheduleHour = Math.max(0, Math.min(23, data.scheduleHour as number));
  }
  if (typeof data.defaultDailyLimit === "number") {
    data.defaultDailyLimit = Math.max(1, Math.min(100, data.defaultDailyLimit as number));
  }

  if (body.scheduleWindowStart === null) {
    data.scheduleWindowStart = null;
  } else if (typeof body.scheduleWindowStart === "number" && Number.isFinite(body.scheduleWindowStart)) {
    data.scheduleWindowStart = Math.max(0, Math.min(23, Math.floor(body.scheduleWindowStart)));
  }

  if (body.scheduleWindowEnd === null) {
    data.scheduleWindowEnd = null;
  } else if (typeof body.scheduleWindowEnd === "number" && Number.isFinite(body.scheduleWindowEnd)) {
    data.scheduleWindowEnd = Math.max(0, Math.min(23, Math.floor(body.scheduleWindowEnd)));
  }

  if (typeof body.postingDays === "string") {
    data.postingDays = serializePostingDays(body.postingDays.split(","));
  } else if (Array.isArray(body.postingDays)) {
    data.postingDays = serializePostingDays(body.postingDays.map(String));
  }

  if (body.postingHoursByDay && typeof body.postingHoursByDay === "object") {
    const hours: Partial<Record<WeekdayKey, number>> = {};
    for (const day of WEEKDAYS) {
      const value = (body.postingHoursByDay as Record<string, unknown>)[day.key];
      if (typeof value === "number" && Number.isFinite(value)) {
        hours[day.key] = value;
      }
    }
    data.postingHoursByDay = serializePostingHoursByDay(hours);
  }

  {
    const current = await ensureAiSettings(session.user.id);
    const articlesPerDay =
      typeof data.defaultDailyLimit === "number"
        ? (data.defaultDailyLimit as number)
        : current.defaultDailyLimit;
    const pinsPerArticle =
      typeof data.pinsPerArticle === "number"
        ? (data.pinsPerArticle as number)
        : current.pinsPerArticle;

    const articleTimesIn =
      Array.isArray(body.articlePostTimes) || typeof body.articlePostTimes === "string"
        ? Array.isArray(body.articlePostTimes)
          ? parsePostTimes(JSON.stringify(body.articlePostTimes))
          : parsePostTimes(body.articlePostTimes)
        : parsePostTimes(current.articlePostTimes);
    data.articlePostTimes = serializePostTimes(resizePostTimes(articleTimesIn, articlesPerDay));

    const pinTimesIn =
      Array.isArray(body.pinPostTimes) || typeof body.pinPostTimes === "string"
        ? Array.isArray(body.pinPostTimes)
          ? parsePostTimes(JSON.stringify(body.pinPostTimes))
          : parsePostTimes(body.pinPostTimes)
        : parsePostTimes(current.pinPostTimes);
    data.pinPostTimes = serializePostTimes(
      resizePostTimes(pinTimesIn, pinsPerArticle * articlesPerDay)
    );
  }

  for (const key of ["openRouterKey", "snapgenApiKey"] as const) {
    if (body[key] && body[key] !== MASK) {
      data[key] = encrypt(String(body[key]));
    }
  }

  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!dbUser || dbUser.disabled) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = dbUser.role === "ADMIN";

  if (isAdmin) {
    const appData: {
      googleClientId?: string | null;
      googleClientSecret?: string | null;
      googleRedirectUri?: string | null;
      pinterestAppId?: string | null;
      pinterestAppSecret?: string | null;
      pinterestRedirectUri?: string | null;
    } = {};
    if (typeof body.googleClientId === "string" && body.googleClientId !== MASK) {
      const id = body.googleClientId.trim();
      if (id && !looksLikeEmail(id)) {
        appData.googleClientId = id;
      } else if (!id) {
        appData.googleClientId = null;
      }
    }
    for (const key of ["googleRedirectUri", "pinterestRedirectUri", "pinterestAppId"] as const) {
      if (body[key] !== undefined && body[key] !== MASK) {
        appData[key] = body[key] ? String(body[key]) : null;
      }
    }
    for (const key of ["googleClientSecret", "pinterestAppSecret"] as const) {
      if (body[key] && body[key] !== MASK) {
        appData[key] = encrypt(String(body[key]));
      }
    }
    if (Object.keys(appData).length) {
      await prisma.appConfig.upsert({
        where: { id: "default" },
        update: appData,
        create: { id: "default", ...appData },
      });
    }
  }

  const edit = body.googleAiKeysEdit;
  if (edit && typeof edit === "object") {
    const current = await ensureAiSettings(session.user.id);
    const existing = decryptGoogleAiKeys(current.googleAiStudioKeys);
    const keepIndices = Array.isArray(edit.keepIndices)
      ? edit.keepIndices
          .map((n: unknown) => (typeof n === "number" ? Math.floor(n) : -1))
          .filter((n: number) => n >= 0 && n < existing.length)
      : [];
    const addKeys = Array.isArray(edit.add)
      ? edit.add
          .map((k: unknown) => String(k ?? "").trim())
          .filter((k: string) => k && k !== MASK && !k.includes("•"))
      : [];
    const next = [
      ...keepIndices.map((i: number) => existing[i]).filter(Boolean),
      ...addKeys,
    ];
    data.googleAiStudioKeys = encryptGoogleAiKeys(next);
    data.googleAiKeyIndex = 0;
  } else if (typeof body.googleAiStudioKeys === "string" && body.googleAiStudioKeys !== MASK) {
    const keys = normalizeGoogleAiKeysInput(body.googleAiStudioKeys);
    if (keys.length) {
      data.googleAiStudioKeys = encryptGoogleAiKeys(keys);
      data.googleAiKeyIndex = 0;
    }
  }

  const settings = await prisma.aiSettings.upsert({
    where: { userId: session.user.id },
    update: data,
    create: { userId: session.user.id, ...data },
  });

  if (typeof data.defaultDailyLimit === "number" && body.applyDailyLimitToBlogs === true) {
    const blogs = await prisma.bloggerBlog.findMany({
      where: { googleAccount: { userId: session.user.id } },
      select: { id: true },
    });
    if (blogs.length) {
      await prisma.bloggerBlog.updateMany({
        where: { id: { in: blogs.map((b) => b.id) } },
        data: { dailyLimit: data.defaultDailyLimit as number },
      });
    }
  }

  return NextResponse.json(await publicSettings(settings, isAdmin));
}
