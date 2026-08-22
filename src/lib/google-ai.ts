import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";
import { buildRewriteSystemPrompt } from "@/lib/rewrite-style";
import {
  buildRewriteUserContent,
  type ListicleRewriteHint,
} from "@/lib/rewrite-listicle";

export type GoogleRewriteResult = {
  title: string;
  html: string;
  metaTitle: string;
  metaDescription: string;
  faqHtml: string;
  tags: string[];
  slug: string;
  category: string | null;
};

function parseKeys(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((k) => String(k).trim()).filter(Boolean);
      }
    } catch {
      // fall through to newline/comma split
    }
  }
  return trimmed
    .split(/[\n,]+/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function normalizeGoogleAiKeysInput(input: string): string[] {
  return parseKeys(input);
}

export function encryptGoogleAiKeys(keys: string[]): string {
  return encrypt(JSON.stringify(keys));
}

export function decryptGoogleAiKeys(encrypted?: string | null): string[] {
  if (!encrypted) return [];
  try {
    return parseKeys(decrypt(encrypted));
  } catch {
    return parseKeys(encrypted);
  }
}

/** Mask a key for Settings UI, e.g. AIza••••••••WXYZ */
export function maskGoogleAiKeyPreview(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return "";
  const last4 = trimmed.slice(-4);
  const prefix = trimmed.startsWith("AIza")
    ? "AIza"
    : trimmed.slice(0, Math.min(4, Math.max(0, trimmed.length - 4)));
  return `${prefix}${"•".repeat(8)}${last4}`;
}

function isQuotaOrRateLimitError(status: number, body: string): boolean {
  if (status === 429 || status === 403) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes("resource_exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("exceeded") ||
    lower.includes("too many requests")
  );
}

async function callGemini(
  apiKey: string,
  model: string,
  system: string,
  userContent: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userContent }] }],
      generationConfig: {
        temperature: 0.7,
        responseMimeType: "application/json",
      },
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    const err = new Error(`Google AI Studio failed (${res.status}): ${text}`) as Error & {
      status?: number;
      body?: string;
      retriable?: boolean;
    };
    err.status = res.status;
    err.body = text;
    err.retriable = isQuotaOrRateLimitError(res.status, text);
    throw err;
  }

  const data = JSON.parse(text) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
  return raw;
}

export async function rewriteWithGoogleAiStudio(
  userId: string,
  input: { title: string; content: string; url: string; categories?: string[] },
  listicle: ListicleRewriteHint | null = null
): Promise<GoogleRewriteResult> {
  const settings = await prisma.aiSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const keys = decryptGoogleAiKeys(settings.googleAiStudioKeys);
  if (!keys.length) {
    throw new Error("Google AI Studio API keys not configured");
  }

  const categories = input.categories || [];
  const model = settings.googleAiModel || "gemini-2.0-flash";
  const system = buildRewriteSystemPrompt(settings, categories, listicle);
  const userContent = buildRewriteUserContent({ ...input, listicle });

  const start = ((settings.googleAiKeyIndex % keys.length) + keys.length) % keys.length;
  const errors: string[] = [];

  for (let offset = 0; offset < keys.length; offset++) {
    const index = (start + offset) % keys.length;
    const apiKey = keys[index];
    try {
      const raw = await callGemini(apiKey, model, system, userContent);
      const parsed = JSON.parse(raw) as GoogleRewriteResult & { category?: string | null };

      // Advance to next key for fairness on the following request
      await prisma.aiSettings.update({
        where: { userId },
        data: { googleAiKeyIndex: (index + 1) % keys.length },
      });

      await prisma.apiUsage.create({
        data: {
          userId,
          service: "google-ai-studio-llm",
          units: 1,
          meta: JSON.stringify({ model, keyIndex: index }),
        },
      });

      return {
        title: parsed.title || input.title,
        html: parsed.html || "",
        metaTitle: parsed.metaTitle || parsed.title || input.title,
        metaDescription: parsed.metaDescription || "",
        faqHtml: parsed.faqHtml || "",
        tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 12) : [],
        slug:
          parsed.slug ||
          (parsed.title || input.title)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, ""),
        category: typeof parsed.category === "string" ? parsed.category : null,
      };
    } catch (err) {
      const e = err as Error & { retriable?: boolean; status?: number };
      errors.push(`key[${index}]: ${e.message}`);
      if (!e.retriable && e.status !== 401 && e.status !== 403) {
        // Non-quota failures on a valid key — still try next key only for auth/quota
        if (e.status && e.status >= 500) continue;
        if (e.retriable) continue;
        // For other client errors, try next key in case this key is bad
        if (e.status === 400) throw err;
        continue;
      }
      // rate limit / exhausted → try next key
      continue;
    }
  }

  throw new Error(
    `All Google AI Studio keys failed (${keys.length} tried). ${errors.slice(0, 3).join(" | ")}`
  );
}
