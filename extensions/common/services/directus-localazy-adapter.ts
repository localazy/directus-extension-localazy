import { getLocalazyLanguages } from '@localazy/languages';
import { LanguageMappingService } from './language-mapping-service';
import { LanguageMappings } from '../models/language-mapping';

/**
 * BCP 47 language tag validation pattern.
 * Matches formats like: en, en-US, zh-Hans, pt-BR, etc.
 */
const LANGUAGE_CODE_PATTERN = /^[a-zA-Z]{2,3}(-[a-zA-Z]{2,4})?(-[a-zA-Z]{2})?(-[a-zA-Z0-9#]+)?$/;

/**
 * Validation result for language codes
 */
export interface LanguageCodeValidation {
  valid: boolean;
  code: string;
  error?: string;
}

export class DirectusLocalazyAdapter {
  private static mappingService: LanguageMappingService | null = null;

  /**
   * Initialize the adapter with custom language mappings from settings.
   * Should be called before any transformation operations.
   */
  static initializeMappings(mappingsInput: string | LanguageMappings): void {
    this.mappingService = new LanguageMappingService(mappingsInput);
  }

  /**
   * Get the current mapping service instance.
   * Returns null if not initialized.
   */
  static getMappingService(): LanguageMappingService | null {
    return this.mappingService;
  }

  /**
   * Clear the current mapping service (useful for testing or resetting state).
   */
  static clearMappings(): void {
    this.mappingService = null;
  }

  static mapDirectusToLocalazySourceLanguage(localazySourceLanguageId: number, directusSourceLanguage: string) {
    const directusSourceLanguageAsLocalazyLanguage = getLocalazyLanguages()
      .find((lang) => lang.localazyId === localazySourceLanguageId)?.locale
  || directusSourceLanguage;
    return directusSourceLanguageAsLocalazyLanguage;
  }

  static mapLocalazyToDirectusSourceLanguage(processedLanguage: string, localazySourceLanguageId: number, directusSourceLanguage: string) {
    const localazySourceLanguage = this.resolveLocalazyLanguageId(localazySourceLanguageId)?.locale;

    if (localazySourceLanguage === processedLanguage) {
      return directusSourceLanguage;
    }
    return processedLanguage;
  }

  /**
   * Transform a Directus language code to Localazy format.
   * Uses custom mapping if available, otherwise falls back to replacing '-' with '_'.
   */
  static transformDirectusToLocalazyLanguage(directusLanguage: string) {
    if (this.mappingService) {
      return this.mappingService.transformDirectusToLocalazy(directusLanguage);
    }
    // Backward compatible fallback
    return directusLanguage.replace('-', '_');
  }

  /**
   * Transform a Localazy language code to Directus preferred format.
   * Uses custom mapping if available, otherwise falls back to replacing '_' with '-'.
   */
  static transformLocalazyToDirectusPreferedFormLanguage(localazyLanguage: string) {
    if (this.mappingService) {
      return this.mappingService.transformLocalazyToDirectus(localazyLanguage);
    }
    // Backward compatible fallback
    return localazyLanguage.replace('_', '-');
  }

  /**
   * Check if a language code has a custom mapping defined.
   */
  static hasCustomMapping(code: string): boolean {
    if (this.mappingService) {
      return this.mappingService.hasCustomMapping(code);
    }
    return false;
  }

  static resolveLocalazyLanguageId(langId: number) {
    return getLocalazyLanguages()
      .find((lang) => lang.localazyId === langId);
  }

  /**
   * Validate a language code format.
   * Checks if the code matches BCP 47 language tag format.
   *
   * @param code - The language code to validate
   * @returns Validation result with status and optional error message
   */
  static validateLanguageCode(code: string): LanguageCodeValidation {
    if (!code || typeof code !== 'string') {
      return {
        valid: false,
        code: code || '',
        error: 'Language code must be a non-empty string',
      };
    }

    const trimmedCode = code.trim();
    if (trimmedCode.length === 0) {
      return {
        valid: false,
        code: trimmedCode,
        error: 'Language code cannot be empty',
      };
    }

    if (trimmedCode.length > 35) {
      return {
        valid: false,
        code: trimmedCode,
        error: 'Language code is too long (max 35 characters)',
      };
    }

    if (!LANGUAGE_CODE_PATTERN.test(trimmedCode)) {
      return {
        valid: false,
        code: trimmedCode,
        error: `Invalid language code format: "${trimmedCode}". Expected format like: en, en-US, zh-Hans`,
      };
    }

    return {
      valid: true,
      code: trimmedCode,
    };
  }

  /**
   * Validate multiple language codes.
   *
   * @param codes - Array of language codes to validate
   * @returns Array of validation results
   */
  static validateLanguageCodes(codes: string[]): LanguageCodeValidation[] {
    return codes.map((code) => this.validateLanguageCode(code));
  }

  /**
   * Check if a language code is recognized by Localazy.
   *
   * @param code - The language code to check
   * @returns True if recognized, false otherwise
   */
  static isRecognizedByLocalazy(code: string): boolean {
    const localazyCode = this.transformDirectusToLocalazyLanguage(code);
    return getLocalazyLanguages().some((lang) => lang.locale === localazyCode);
  }
}
