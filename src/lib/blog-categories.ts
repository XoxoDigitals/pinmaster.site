export function parseCategories(raw?: string | null): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .map((c) => String(c).trim())
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

export function serializeCategories(categories: string[]): string {
  const cleaned = [
    ...new Set(categories.map((c) => c.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));
  return JSON.stringify(cleaned);
}

/** Pick a category from the allowed list (case-insensitive); null if none match / empty. */
export function resolveCategory(
  chosen: string | null | undefined,
  available: string[]
): string | null {
  if (!available.length) return null;
  const raw = (chosen || "").trim();
  if (!raw) return available[0] || null;
  const lower = raw.toLowerCase();
  const exact = available.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  const partial = available.find(
    (c) => c.toLowerCase().includes(lower) || lower.includes(c.toLowerCase())
  );
  return partial || available[0] || null;
}
