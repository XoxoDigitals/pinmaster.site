import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";

export type SnapgenGenerateOptions = {
  prompt: string;
  aspectRatio?: string;
  style?: string;
  model?: string;
};

function maybeDecrypt(value?: string | null): string {
  if (!value) return "";
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

/**
 * SnapGen / GeminiGen image API (docs: https://docs.snapgen.ai + GeminiGen getting-started).
 * POST {base}/uapi/v1/generate_image with x-api-key and multipart form fields.
 */
export async function generateSnapgenImage(
  userId: string,
  options: SnapgenGenerateOptions
): Promise<string> {
  const settings = await prisma.aiSettings.upsert({
    where: { userId },
    update: {},
    create: { userId },
  });

  const apiKey = maybeDecrypt(settings.snapgenApiKey);
  if (!apiKey) throw new Error("SnapGen API key not configured");

  const baseUrl = (settings.snapgenBaseUrl || "https://api.snapgen.ai").replace(/\/$/, "");
  const model = options.model || settings.snapgenModel || "imagen-flash";
  const aspectRatio = options.aspectRatio || "9:16";
  const style = options.style || settings.imageStyle || "Photorealistic";

  const styledPrompt = [
    settings.imageSystemPrompt ||
      "Create a high-quality, realistic image with no text, logos, or watermarks.",
    `Style: ${style}.`,
    options.prompt,
  ].join(" ");

  const form = new FormData();
  form.append("prompt", styledPrompt);
  form.append("model", model);
  form.append("aspect_ratio", aspectRatio);
  if (style && style.toLowerCase() !== "none") {
    form.append("style", style);
  }

  const res = await fetch(`${baseUrl}/uapi/v1/generate_image`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
    },
    body: form,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SnapGen image failed (${res.status}): ${text}`);
  }

  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`SnapGen returned non-JSON: ${text.slice(0, 300)}`);
  }

  const result = extractImageResult(data);
  if (!result) {
    throw new Error(
      `SnapGen returned no image. Response: ${text.slice(0, 500)}. If async, configure webhook or check job status.`
    );
  }

  await prisma.apiUsage.create({
    data: {
      userId,
      service: "snapgen-image",
      units: 1,
      meta: JSON.stringify({ model, aspectRatio }),
    },
  });

  return result;
}

function extractImageResult(data: Record<string, unknown>): string | null {
  const b64 = data.base64_images;
  if (typeof b64 === "string" && b64.length > 0) {
    return b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`;
  }
  if (Array.isArray(b64) && typeof b64[0] === "string") {
    const first = b64[0];
    return first.startsWith("data:") ? first : `data:image/png;base64,${first}`;
  }

  for (const key of ["image_url", "url", "download_url", "file_url"] as const) {
    const v = data[key];
    if (typeof v === "string" && (v.startsWith("http") || v.startsWith("data:"))) {
      return v;
    }
  }

  const images = data.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    if (typeof first === "string") {
      return first.startsWith("data:") || first.startsWith("http")
        ? first
        : `data:image/png;base64,${first}`;
    }
    if (first && typeof first === "object") {
      const obj = first as Record<string, unknown>;
      for (const key of ["url", "image_url", "base64"] as const) {
        const v = obj[key];
        if (typeof v === "string") {
          if (key === "base64") {
            return v.startsWith("data:") ? v : `data:image/png;base64,${v}`;
          }
          return v;
        }
      }
    }
  }

  const output = data.output;
  if (typeof output === "string" && (output.startsWith("http") || output.startsWith("data:"))) {
    return output;
  }

  return null;
}

export function snapgenAspectForPin(vertical: boolean): string {
  // imagen-flash supports 16:9 and 9:16; use 9:16 for Pinterest pins
  return vertical ? "9:16" : "16:9";
}
