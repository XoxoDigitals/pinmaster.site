import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { buildPinCopySystemPrompt } from "@/lib/rewrite-style";
import { decryptGoogleAiKeys } from "@/lib/google-ai";

export type PinCopyResult = {
  title: string;
  description: string;
  hashtags: string[];
};

async function getOpenRouterKey(userId: string): Promise<string> {
  const settings = await prisma.aiSettings.findUnique({ where: { userId } });
  if (settings?.openRouterKey) {
    try {
      return decrypt(settings.openRouterKey);
    } catch {
      return settings.openRouterKey;
    }
  }
  return "";
}

function formatPinDescription(description: string, hashtags: string[]): string {
  const body = description.trim();
  const tags = hashtags
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => `#${t.replace(/\s+/g, "")}`);
  if (!tags.length) return body.slice(0, 500);
  const withTags = body ? `${body}\n\n${tags.join(" ")}` : tags.join(" ");
  return withTags.slice(0, 500);
}

function fallbackPinCopy(
  articleTitle: string,
  pinType: string,
  index: number
): PinCopyResult {
  const title =
    index === 0
      ? articleTitle.slice(0, 100)
      : `${articleTitle.slice(0, 80)} — ${pinType.split("/")[0].trim()}`.slice(0, 100);
  return {
    title,
    description: `${articleTitle}. ${pinType} pin with practical takeaways.`.slice(0, 500),
    hashtags: [],
  };
}

async function pinCopyWithOpenRouter(
  userId: string,
  settings: {
    model: string;
    rewriteStyle: string;
    toneOfVoice: string;
    language: string;
  },
  input: {
    articleTitle: string;
    articleExcerpt: string;
    pinType: string;
    pinIndex: number;
    link?: string;
  }
): Promise<PinCopyResult> {
  const apiKey = await getOpenRouterKey(userId);
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const model = settings.model || process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-4o-mini";
  const system = buildPinCopySystemPrompt(settings);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXTAUTH_URL || "http://localhost:3000",
      "X-Title": "ContentOps Platform",
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Pin type: ${input.pinType}
Pin variation index: ${input.pinIndex + 1}
Article title: ${input.articleTitle}
${input.link ? `Article URL: ${input.link}\n` : ""}
Article context:
${input.articleExcerpt.slice(0, 4000)}

Write a unique title and SEO description for this Pinterest pin. Make it clearly different from other pin types for the same article.`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter pin copy failed: ${await res.text()}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as Partial<PinCopyResult>;

  await prisma.apiUsage.create({
    data: {
      userId,
      service: "openrouter-llm",
      units: 1,
      meta: JSON.stringify({ model, purpose: "pin-copy", pinType: input.pinType }),
    },
  });

  return {
    title: (parsed.title || input.articleTitle).slice(0, 100),
    description: String(parsed.description || ""),
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
  };
}

async function pinCopyWithGoogleAiStudio(
  userId: string,
  settings: {
    googleAiModel: string;
    googleAiStudioKeys: string | null;
    googleAiKeyIndex: number;
    rewriteStyle: string;
    toneOfVoice: string;
    language: string;
  },
  input: {
    articleTitle: string;
    articleExcerpt: string;
    pinType: string;
    pinIndex: number;
    link?: string;
  }
): Promise<PinCopyResult> {
  const keys = decryptGoogleAiKeys(settings.googleAiStudioKeys);
  if (!keys.length) throw new Error("Google AI Studio API keys not configured");

  const model = settings.googleAiModel || "gemini-2.0-flash";
  const system = buildPinCopySystemPrompt(settings);
  const userContent = `Pin type: ${input.pinType}
Pin variation index: ${input.pinIndex + 1}
Article title: ${input.articleTitle}
${input.link ? `Article URL: ${input.link}\n` : ""}
Article context:
${input.articleExcerpt.slice(0, 4000)}

Write a unique title and SEO description for this Pinterest pin. Make it clearly different from other pin types for the same article.
Return ONLY valid JSON with keys: title, description, hashtags.`;

  const start = ((settings.googleAiKeyIndex % keys.length) + keys.length) % keys.length;
  const errors: string[] = [];

  for (let offset = 0; offset < keys.length; offset++) {
    const index = (start + offset) % keys.length;
    const apiKey = keys[index];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    try {
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
            temperature: 0.8,
            responseMimeType: "application/json",
          },
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        errors.push(`key[${index}]: ${res.status} ${text.slice(0, 200)}`);
        continue;
      }
      const data = JSON.parse(text) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const raw =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
      const parsed = JSON.parse(raw) as Partial<PinCopyResult>;

      await prisma.aiSettings.update({
        where: { userId },
        data: { googleAiKeyIndex: (index + 1) % keys.length },
      });
      await prisma.apiUsage.create({
        data: {
          userId,
          service: "google-ai-studio-llm",
          units: 1,
          meta: JSON.stringify({ model, purpose: "pin-copy", pinType: input.pinType, keyIndex: index }),
        },
      });

      return {
        title: (parsed.title || input.articleTitle).slice(0, 100),
        description: String(parsed.description || ""),
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
      };
    } catch (err) {
      errors.push(`key[${index}]: ${(err as Error).message}`);
      continue;
    }
  }

  throw new Error(
    `All Google AI Studio keys failed for pin copy. ${errors.slice(0, 2).join(" | ")}`
  );
}

/**
 * Generate unique Pinterest title + description for a pin variation.
 * Uses the same content provider path as article rewrite (OpenRouter or Google AI Studio).
 */
export async function generatePinCopy(
  userId: string,
  input: {
    articleTitle: string;
    articleExcerpt: string;
    pinType: string;
    pinIndex: number;
    link?: string;
  }
): Promise<{ title: string; description: string }> {
  const settings = await prisma.aiSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  try {
    const raw =
      settings.contentProvider === "google_ai_studio"
        ? await pinCopyWithGoogleAiStudio(userId, settings, input)
        : await pinCopyWithOpenRouter(userId, settings, input);

    return {
      title: raw.title.slice(0, 100),
      description: formatPinDescription(raw.description, raw.hashtags),
    };
  } catch (err) {
    console.warn("generatePinCopy fallback:", (err as Error).message);
    const fb = fallbackPinCopy(input.articleTitle, input.pinType, input.pinIndex);
    return {
      title: fb.title,
      description: formatPinDescription(fb.description, fb.hashtags),
    };
  }
}
