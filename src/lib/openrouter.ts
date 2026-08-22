import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { buildRewriteSystemPrompt } from "@/lib/rewrite-style";
import { rewriteWithGoogleAiStudio } from "@/lib/google-ai";
import { generateSnapgenImage, snapgenAspectForPin } from "@/lib/snapgen";
import { finalizeRewrittenHtml, prepareContentForRewrite } from "@/lib/rewrite-html";

export type RewriteResult = {
  title: string;
  html: string;
  metaTitle: string;
  metaDescription: string;
  faqHtml: string;
  tags: string[];
  slug: string;
  category: string | null;
};

export type GenerateImageOptions = {
  vertical?: boolean;
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

export async function rewriteArticle(
  userId: string,
  input: {
    title: string;
    content: string;
    url: string;
    categories?: string[];
    extraImageUrls?: string[];
  }
): Promise<RewriteResult> {
  const settings = await prisma.aiSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const prepared = prepareContentForRewrite(input.content, input.url);
  const payload = { ...input, content: prepared.markedHtml };

  const result =
    settings.contentProvider === "google_ai_studio"
      ? await rewriteWithGoogleAiStudio(userId, payload)
      : await rewriteWithOpenRouter(userId, payload, settings);

  return {
    ...result,
    html: finalizeRewrittenHtml(input.content, prepared.blocks, result.html, {
      extraSrcs: input.extraImageUrls,
      baseUrl: input.url,
    }),
  };
}

async function rewriteWithOpenRouter(
  userId: string,
  input: { title: string; content: string; url: string; categories?: string[] },
  settings: {
    model: string;
    rewriteStyle: string;
    toneOfVoice: string;
    language: string;
    articleLength: string;
    seoLevel: string;
  }
): Promise<RewriteResult> {
  const apiKey = await getOpenRouterKey(userId);
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const categories = input.categories || [];
  const model = settings.model || process.env.OPENROUTER_DEFAULT_MODEL || "openai/gpt-4o-mini";
  const system = buildRewriteSystemPrompt(settings, categories);

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
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Source URL: ${input.url}\nOriginal title: ${input.title}\n\nOriginal content:\n${input.content.slice(0, 24000)}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter rewrite failed: ${await res.text()}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as RewriteResult & { category?: string | null };

  await prisma.apiUsage.create({
    data: { userId, service: "openrouter-llm", units: 1, meta: JSON.stringify({ model }) },
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
}

export async function generateImage(
  userId: string,
  prompt: string,
  options: GenerateImageOptions = {}
): Promise<string> {
  const settings = await prisma.aiSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  if (settings.imageProvider === "snapgen") {
    return generateSnapgenImage(userId, {
      prompt,
      aspectRatio: snapgenAspectForPin(Boolean(options.vertical)),
      style: settings.imageStyle,
    });
  }

  return generateWithOpenRouter(userId, prompt, settings);
}

async function generateWithOpenRouter(
  userId: string,
  prompt: string,
  settings: {
    imageModel: string;
    imageSystemPrompt: string;
    imageStyle: string;
  }
): Promise<string> {
  const apiKey = await getOpenRouterKey(userId);
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  const model =
    settings.imageModel || process.env.OPENROUTER_IMAGE_MODEL || "x-ai/grok-2-image";

  const styledPrompt = [
    settings.imageSystemPrompt ||
      "Create a high-quality, realistic image with no text, logos, or watermarks.",
    `Style: ${settings.imageStyle}.`,
    prompt,
  ].join(" ");

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
      messages: [
        {
          role: "system",
          content:
            settings.imageSystemPrompt ||
            "You generate professional marketing images. No text overlays.",
        },
        { role: "user", content: styledPrompt },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter image failed: ${await res.text()}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  const imageUrl =
    message?.images?.[0]?.image_url?.url ||
    message?.content?.find?.(
      (c: { type?: string; image_url?: { url?: string } }) => c.type === "image_url"
    )?.image_url?.url;

  let result = imageUrl as string | undefined;
  if (!result && typeof message?.content === "string") {
    const match = message.content.match(/!\[.*?\]\((.*?)\)/);
    if (match) result = match[1];
    if (message.content.startsWith("data:image")) result = message.content;
  }

  if (!result) {
    throw new Error("No image returned from OpenRouter");
  }

  await prisma.apiUsage.create({
    data: { userId, service: "openrouter-image", units: 1, meta: JSON.stringify({ model }) },
  });

  return result;
}

export function buildImagePrompt(
  title: string,
  excerpt: string,
  vertical = false,
  variation = 1,
  pinType?: string
) {
  const aspect = vertical
    ? "Vertical Pinterest pin composition 2:3"
    : "Wide featured blog image 16:9";
  const typeNote = pinType
    ? ` Pin creative type: ${pinType}. Make this variation visually distinct for that type.`
    : variation > 1
      ? ` Variation ${variation}: different angle/composition.`
      : "";
  return `${aspect} illustrating: ${title}. Context: ${excerpt.slice(0, 400)}.${typeNote}`;
}
