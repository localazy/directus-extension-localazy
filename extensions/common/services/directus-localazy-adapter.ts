import { getLocalazyLanguages } from '@localazy/languages';

export class DirectusLocalazyAdapter {
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

  /** Directus prefers to use '-' whereas Localazy '_' as region separator */
  static transformDirectusToLocalazyLanguage(directusLanguage: string) {
    return directusLanguage.replace('-', '_');
  }

  /** Directus prefers to use '-' whereas Localazy '_' as region separator */
  static transformLocalazyToDirectusPreferedFormLanguage(directusLanguage: string) {
    return directusLanguage.replace('_', '-');
  }

  static resolveLocalazyLanguageId(langId: number) {
    return getLocalazyLanguages()
      .find((lang) => lang.localazyId === langId);
  }
}
