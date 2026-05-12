/**
 * Custom mapping between a Directus language code and a Localazy language code.
 * Used when the default transformation (replacing `-` with `_`) isn't enough.
 * Example: Directus uses `zh-Hans` while Localazy uses `zh-CN#Hans`.
 */
export type LanguageMapping = {
  /** The language code as used in Directus (e.g., `zh-Hans`). */
  directusCode: string;
  /** The language code as used in Localazy (e.g., `zh-CN#Hans`). */
  localazyCode: string;
  /** Optional human-readable note explaining the mapping. */
  description?: string;
};

export type LanguageMappings = LanguageMapping[];
