import { getLocalazyLanguages } from '@localazy/languages';
import { LanguageMappingService } from './language-mapping-service';
import { LanguageMappings } from '../models/language-mapping';

export class DirectusLocalazyAdapter {
  /**
   * Process-wide mapping service. Each extension (hook in Node, module in the browser)
   * has its own static slot. Callers should invoke `initializeMappings` once settings are
   * available; until then, the transform methods fall back to the default `-` ↔ `_` swap.
   */
  private static mappingService: LanguageMappingService | null = null;

  static initializeMappings(mappingsInput: string | LanguageMappings): void {
    this.mappingService = new LanguageMappingService(mappingsInput);
  }

  static getMappingService(): LanguageMappingService | null {
    return this.mappingService;
  }

  static clearMappings(): void {
    this.mappingService = null;
  }

  static mapDirectusToLocalazySourceLanguage(localazySourceLanguageId: number, directusSourceLanguage: string) {
    const directusSourceLanguageAsLocalazyLanguage =
      getLocalazyLanguages().find((lang) => lang.localazyId === localazySourceLanguageId)?.locale || directusSourceLanguage;
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
   * Directus prefers `-` as a region separator, Localazy uses `_`. When a custom mapping
   * is configured for the code, it wins over the default character swap.
   */
  static transformDirectusToLocalazyLanguage(directusLanguage: string) {
    if (this.mappingService) {
      return this.mappingService.transformDirectusToLocalazy(directusLanguage);
    }
    return directusLanguage.replace('-', '_');
  }

  /**
   * Inverse of `transformDirectusToLocalazyLanguage`. Custom mapping wins over default
   * `_` → `-` swap when configured.
   */
  static transformLocalazyToDirectusPreferedFormLanguage(localazyLanguage: string) {
    if (this.mappingService) {
      return this.mappingService.transformLocalazyToDirectus(localazyLanguage);
    }
    return localazyLanguage.replace('_', '-');
  }

  static resolveLocalazyLanguageId(langId: number) {
    return getLocalazyLanguages().find((lang) => lang.localazyId === langId);
  }
}
