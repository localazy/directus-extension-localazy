import { LanguageMappings } from '../models/language-mapping';

/**
 * Service for handling custom language code mappings between Directus and Localazy.
 *
 * Directus and Localazy use different conventions for language codes:
 * - Directus typically uses BCP 47 format (e.g., `zh-Hans`, `pt-BR`)
 * - Localazy uses locale format with special characters (e.g., `zh-CN#Hans`, `pt_BR`)
 *
 * For most codes the default transformation (`-` ↔ `_`) works. This service lets
 * users define explicit mappings for codes that can't be converted that way, with
 * fallback to the default transformation when no mapping exists.
 */
export class LanguageMappingService {
  private directusToLocalazy: Map<string, string> = new Map();

  private localazyToDirectus: Map<string, string> = new Map();

  /**
   * @param mappingsInput JSON string (from the Directus settings field) or an
   *                      already-parsed `LanguageMappings` array.
   */
  constructor(mappingsInput: string | LanguageMappings) {
    this.loadMappings(mappingsInput);
  }

  private loadMappings(input: string | LanguageMappings): void {
    try {
      const mappings: LanguageMappings = Array.isArray(input) ? input : (JSON.parse(input || '[]') as LanguageMappings);
      mappings.forEach((mapping) => {
        if (mapping.directusCode && mapping.localazyCode) {
          this.directusToLocalazy.set(mapping.directusCode, mapping.localazyCode);
          this.localazyToDirectus.set(mapping.localazyCode, mapping.directusCode);
        }
      });
    } catch (e) {
      console.error('Failed to parse language mappings:', e);
    }
  }

  /**
   * Transform a Directus language code to a Localazy language code. Uses the
   * custom mapping if defined; otherwise falls back to replacing `-` with `_`.
   */
  transformDirectusToLocalazy(directusCode: string): string {
    const mapped = this.directusToLocalazy.get(directusCode);
    if (mapped !== undefined) {
      return mapped;
    }
    return directusCode.replace('-', '_');
  }

  /**
   * Transform a Localazy language code to a Directus language code. Uses the
   * custom mapping if defined; otherwise falls back to replacing `_` with `-`.
   */
  transformLocalazyToDirectus(localazyCode: string): string {
    const mapped = this.localazyToDirectus.get(localazyCode);
    if (mapped !== undefined) {
      return mapped;
    }
    return localazyCode.replace('_', '-');
  }

  /** Whether a code has a custom mapping in either direction. */
  hasCustomMapping(code: string): boolean {
    return this.directusToLocalazy.has(code) || this.localazyToDirectus.has(code);
  }

  /** All configured mappings as an array. */
  getAllMappings(): LanguageMappings {
    const mappings: LanguageMappings = [];
    this.directusToLocalazy.forEach((localazyCode, directusCode) => {
      mappings.push({ directusCode, localazyCode });
    });
    return mappings;
  }

  /**
   * Validate a JSON string of language mappings. Checks structural integrity
   * (array of objects with non-empty directusCode + localazyCode strings) plus
   * absence of duplicate codes in either column.
   */
  static validateMappings(json: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const parsed: unknown = JSON.parse(json || '[]');

      if (!Array.isArray(parsed)) {
        errors.push('Mappings must be an array');
        return { valid: false, errors };
      }

      const directusCodes = new Set<string>();
      const localazyCodes = new Set<string>();

      parsed.forEach((entry, index) => {
        const mapping = entry as Partial<LanguageMappings[number]>;
        const mappingNum = index + 1;

        if (typeof mapping.directusCode !== 'string') {
          errors.push(`Mapping ${mappingNum}: Missing or invalid Directus code`);
        } else if (mapping.directusCode.trim() === '') {
          errors.push(`Mapping ${mappingNum}: Directus code cannot be empty`);
        } else if (directusCodes.has(mapping.directusCode)) {
          errors.push(`Mapping ${mappingNum}: Duplicate Directus code "${mapping.directusCode}"`);
        } else {
          directusCodes.add(mapping.directusCode);
        }

        if (typeof mapping.localazyCode !== 'string') {
          errors.push(`Mapping ${mappingNum}: Missing or invalid Localazy code`);
        } else if (mapping.localazyCode.trim() === '') {
          errors.push(`Mapping ${mappingNum}: Localazy code cannot be empty`);
        } else if (localazyCodes.has(mapping.localazyCode)) {
          errors.push(`Mapping ${mappingNum}: Duplicate Localazy code "${mapping.localazyCode}"`);
        } else {
          localazyCodes.add(mapping.localazyCode);
        }
      });
    } catch {
      errors.push('Invalid JSON format');
    }

    return { valid: errors.length === 0, errors };
  }
}
