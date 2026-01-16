import { LanguageMappings } from '../models/language-mapping';

/**
 * Service for handling custom language code mappings between Directus and Localazy.
 *
 * Directus and Localazy use different conventions for language codes:
 * - Directus typically uses BCP 47 format (e.g., `zh-Hans`, `pt-BR`)
 * - Localazy uses locale format with special characters (e.g., `zh-CN#Hans`, `pt_BR`)
 *
 * This service allows defining explicit mappings for codes that cannot be converted
 * through simple character replacement, with fallback to default transformation
 * when no custom mapping exists.
 *
 * @example
 * ```typescript
 * const service = new LanguageMappingService('[{"directusCode":"zh-Hans","localazyCode":"zh-CN#Hans"}]');
 * service.transformDirectusToLocalazy('zh-Hans'); // Returns 'zh-CN#Hans'
 * service.transformDirectusToLocalazy('en-US'); // Returns 'en_US' (default fallback)
 * ```
 */
export class LanguageMappingService {
  private directusToLocalazy: Map<string, string> = new Map();

  private localazyToDirectus: Map<string, string> = new Map();

  /**
   * Creates a new LanguageMappingService instance.
   *
   * @param mappingsInput - JSON string or array containing language mappings.
   *                        Format: `[{directusCode: string, localazyCode: string, description?: string}]`
   */
  constructor(mappingsInput: string | LanguageMappings) {
    this.loadMappings(mappingsInput);
  }

  private loadMappings(input: string | LanguageMappings): void {
    try {
      // Handle both string (from code) and array (from Directus JSON field)
      const mappings: LanguageMappings = Array.isArray(input)
        ? input
        : JSON.parse(input || '[]');
      mappings.forEach((mapping) => {
        if (mapping.directusCode && mapping.localazyCode) {
          this.directusToLocalazy.set(mapping.directusCode, mapping.localazyCode);
          this.localazyToDirectus.set(mapping.localazyCode, mapping.directusCode);
        }
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to parse language mappings:', e);
    }
  }

  /**
   * Transform a Directus language code to a Localazy language code.
   * Uses custom mapping if available, otherwise falls back to default transformation.
   */
  transformDirectusToLocalazy(directusCode: string): string {
    if (this.directusToLocalazy.has(directusCode)) {
      return this.directusToLocalazy.get(directusCode)!;
    }
    // Default fallback: replace '-' with '_'
    return directusCode.replace('-', '_');
  }

  /**
   * Transform a Localazy language code to a Directus language code.
   * Uses custom mapping if available, otherwise falls back to default transformation.
   */
  transformLocalazyToDirectus(localazyCode: string): string {
    if (this.localazyToDirectus.has(localazyCode)) {
      return this.localazyToDirectus.get(localazyCode)!;
    }
    // Default fallback: replace '_' with '-'
    return localazyCode.replace('_', '-');
  }

  /**
   * Check if a language code has a custom mapping defined.
   */
  hasCustomMapping(code: string): boolean {
    return this.directusToLocalazy.has(code) || this.localazyToDirectus.has(code);
  }

  /**
   * Get the custom mapping for a Directus code, if it exists.
   */
  getDirectusMapping(directusCode: string): string | undefined {
    return this.directusToLocalazy.get(directusCode);
  }

  /**
   * Get the custom mapping for a Localazy code, if it exists.
   */
  getLocalazyMapping(localazyCode: string): string | undefined {
    return this.localazyToDirectus.get(localazyCode);
  }

  /**
   * Get all configured mappings.
   */
  getAllMappings(): LanguageMappings {
    const mappings: LanguageMappings = [];
    this.directusToLocalazy.forEach((localazyCode, directusCode) => {
      mappings.push({ directusCode, localazyCode });
    });
    return mappings;
  }

  /**
   * Validate a JSON string containing language mappings.
   * Returns validation result with any errors found.
   */
  static validateMappings(json: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const mappings: LanguageMappings = JSON.parse(json || '[]');

      if (!Array.isArray(mappings)) {
        errors.push('Mappings must be an array');
        return { valid: false, errors };
      }

      const directusCodes = new Set<string>();
      const localazyCodes = new Set<string>();

      mappings.forEach((mapping, index) => {
        const mappingNum = index + 1;

        if (mapping.directusCode === undefined || mapping.directusCode === null || typeof mapping.directusCode !== 'string') {
          errors.push(`Mapping ${mappingNum}: Missing or invalid Directus code`);
        } else if (mapping.directusCode.trim() === '') {
          errors.push(`Mapping ${mappingNum}: Directus code cannot be empty`);
        } else if (directusCodes.has(mapping.directusCode)) {
          errors.push(`Mapping ${mappingNum}: Duplicate Directus code "${mapping.directusCode}"`);
        } else {
          directusCodes.add(mapping.directusCode);
        }

        if (mapping.localazyCode === undefined || mapping.localazyCode === null || typeof mapping.localazyCode !== 'string') {
          errors.push(`Mapping ${mappingNum}: Missing or invalid Localazy code`);
        } else if (mapping.localazyCode.trim() === '') {
          errors.push(`Mapping ${mappingNum}: Localazy code cannot be empty`);
        } else if (localazyCodes.has(mapping.localazyCode)) {
          errors.push(`Mapping ${mappingNum}: Duplicate Localazy code "${mapping.localazyCode}"`);
        } else {
          localazyCodes.add(mapping.localazyCode);
        }
      });
    } catch (e) {
      errors.push('Invalid JSON format');
    }

    return { valid: errors.length === 0, errors };
  }
}
