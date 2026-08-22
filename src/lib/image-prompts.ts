/** Previous default stored in DB — migrated to DEFAULT_IMAGE_SYSTEM_PROMPT when unchanged. */
export const LEGACY_IMAGE_SYSTEM_PROMPT =
  "Create a high-quality, realistic image with no text, logos, or watermarks. Focus on clear subject composition and professional lighting.";

export const DEFAULT_IMAGE_SYSTEM_PROMPT =
  "Create a high-quality, professional marketing image. Include bold, large, readable overlay text showing the exact title phrase provided in the user prompt (for example: 10 Cake Recipes You Must Try). Use high-contrast typography on a semi-transparent band or integrated hero layout. No logos or watermarks besides that title text. Photorealistic composition with professional lighting.";

export function effectiveImageSystemPrompt(stored?: string | null): string {
  const trimmed = stored?.trim();
  if (!trimmed || trimmed === LEGACY_IMAGE_SYSTEM_PROMPT) {
    return DEFAULT_IMAGE_SYSTEM_PROMPT;
  }
  return trimmed;
}
