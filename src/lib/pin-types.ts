/** Default ordered pin creative types for multi-pin articles. */
export const DEFAULT_PIN_TYPES = [
  "Educational / Tip",
  "Inspirational / Quote-style visual",
  "How-to / Step",
  "Product / Lifestyle",
  "Stat / List",
] as const;

export type PinTypePreset = (typeof DEFAULT_PIN_TYPES)[number] | string;

const TYPE_IMAGE_HINTS: Record<string, string> = {
  "Educational / Tip":
    "Clean educational tip visual: one clear subject, soft instructional mood, space that implies a tip without any text overlay.",
  "Inspirational / Quote-style visual":
    "Inspirational mood visual: atmospheric, calm, scroll-stopping composition with emotional warmth — no text, logos, or quote typography.",
  "How-to / Step":
    "How-to / process visual: hands-on step feeling, practical scene, sequential craft energy without numbered labels or text.",
  "Product / Lifestyle":
    "Product lifestyle scene: aspirational but grounded context, natural light, real-world setting — no packaging text or logos.",
  "Stat / List":
    "Bold list/stat energy visual: strong graphic composition, clear focal point, organized visual hierarchy — no numbers or text overlays.",
};

export function parsePinTypes(raw?: string | null): string[] {
  if (!raw?.trim()) return [...DEFAULT_PIN_TYPES];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      const types = parsed.map((t) => String(t).trim()).filter(Boolean);
      return types.length ? types : [...DEFAULT_PIN_TYPES];
    }
  } catch {
    // fall through
  }
  const split = raw
    .split(/[\n,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return split.length ? split : [...DEFAULT_PIN_TYPES];
}

export function serializePinTypes(types: string[]): string {
  const cleaned = types.map((t) => t.trim()).filter(Boolean);
  return JSON.stringify(cleaned.length ? cleaned : [...DEFAULT_PIN_TYPES]);
}

/** Pick pin type for index i (0-based); cycles when fewer types than pins. */
export function pinTypeForIndex(types: string[], index: number): string {
  const list = types.length ? types : [...DEFAULT_PIN_TYPES];
  return list[index % list.length];
}

export function imageHintForPinType(pinType: string): string {
  return (
    TYPE_IMAGE_HINTS[pinType] ||
    `Creative variation for pin type "${pinType}": distinct composition and mood, no text overlays.`
  );
}
