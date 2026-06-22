import { getLocalazyLanguages } from '@localazy/languages';
import { Language, Project } from '@localazy/api-client';
import { uniqWith } from 'lodash';
import { DirectusApi } from '../interfaces/directus-api';
import { CreateMissingLanguagesInDirectus } from '../enums/create-missing-languages-in-directus';
import { Settings } from '../models/collections-data/settings';
import { DirectusLocalazyLanguage } from '../models/directus-localazy-language';
import { pickLanguageName } from '../utilities/language-display';
import { DirectusLocalazyAdapter } from './directus-localazy-adapter';

export type DirectusLanguageRow = {
  code: string;
  name: string | null;
};

type GetDirectusSourceLanguageAsLocalazyLanguage = {
  localazySourceLanguage: number;
  directusSourceLanguage: string;
};

export class SynchronizationLanguagesService {
  private directusApi!: DirectusApi;

  constructor(directusApi: DirectusApi) {
    this.directusApi = directusApi;
  }

  async fetchDirectusLanguages(languageCollection: string, languageCodeField: string): Promise<string[]> {
    const result = await this.directusApi.fetchDirectusItems(languageCollection, {
      fields: [languageCodeField],
    });
    return result.map((item) => item[languageCodeField] as string);
  }

  async fetchDirectusLanguageRows(languageCollection: string, languageCodeField: string): Promise<DirectusLanguageRow[]> {
    const result = await this.directusApi.fetchDirectusItems(languageCollection, {
      fields: ['*'],
    });
    return result
      .map((item) => {
        const code = item[languageCodeField];
        if (typeof code !== 'string' || code.length === 0) return null;
        return { code, name: pickLanguageName(item as Record<string, unknown>) };
      })
      .filter((row): row is DirectusLanguageRow => row !== null);
  }

  async createLanguages(settings: Settings, localazyLanguages: Language[]) {
    const { language_code_field, language_collection } = settings;
    // for...of awaits each creation properly (forEach(async ...) fires-and-forgets) and
    // routes the Localazy code through the adapter so any custom mapping wins over the
    // default `_` → `-` swap.
    for (const language of localazyLanguages) {
      const directusCode = DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(language.code);
      await this.directusApi.createDirectusItem(language_collection, {
        [language_code_field]: directusCode,
        name: language.name,
      });
    }
  }

  async resolveImportLanguages(settings: Settings, localazyProject: Project): Promise<DirectusLocalazyLanguage[]> {
    DirectusLocalazyAdapter.initializeMappings(settings.language_mappings || '[]');
    const { language_code_field, language_collection, import_source_language } = settings;
    const directusLanguages = await this.fetchDirectusLanguages(language_collection, language_code_field);
    const localazyLanguages = localazyProject.languages || [];
    const localazySourceLanguage = getLocalazyLanguages().find((lang) => lang.localazyId === localazyProject.sourceLanguage)?.locale || '';

    const directusExpandedLangauges = directusLanguages.map((directusLanguage) => ({
      originalForm: directusLanguage,
      directusForm: directusLanguage,
      localazyForm: DirectusLocalazyAdapter.transformDirectusToLocalazyLanguage(directusLanguage),
    }));

    // Localazy project languages with no backing row in the Directus languages collection.
    // Same comparison the create step uses below, so "missing" and "created" stay in lockstep.
    const localazyLanguagesNotInDirectus = localazyLanguages.filter(
      (l) => !directusExpandedLangauges.some((directusLanguage) => directusLanguage.localazyForm === l.code),
    );

    // Of the missing languages, the subset we'll actually create in Directus. `NO` creates
    // nothing; `ALL` creates every missing language.
    // Note: `enabled` isn't on @localazy/api-client's Language type. At runtime this access
    // is always undefined, so the `ONLY_NON_HIDDEN` branch is effectively ALL-only today —
    // preserving the existing (already-inert) "filter by enabled" behaviour.
    const localazyLanguagesToCreate =
      settings.create_missing_languages_in_directus === CreateMissingLanguagesInDirectus.NO
        ? []
        : localazyLanguagesNotInDirectus.filter(
            (l) =>
              settings.create_missing_languages_in_directus === CreateMissingLanguagesInDirectus.ALL ||
              (l as { enabled?: boolean }).enabled,
          );
    if (localazyLanguagesToCreate.length > 0) {
      await this.createLanguages(settings, localazyLanguagesToCreate);
    }

    // Import only languages that have a Directus row: the ones already present, plus the
    // ones we just created. A Localazy language that's missing from Directus and was NOT
    // created is intentionally skipped — writing its translation rows would fail the
    // `languages_code` foreign key (`Invalid foreign key "ja" …`). This is the
    // "when the import doesn't create the missing language, skip it" behaviour, gated by
    // the `create_missing_languages_in_directus` setting.
    const createdExpandedLanguages: DirectusLocalazyLanguage[] = localazyLanguagesToCreate.map((localazyLanguage) => ({
      originalForm: localazyLanguage.code,
      directusForm: DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(localazyLanguage.code),
      localazyForm: localazyLanguage.code,
    }));
    let importLanguages: DirectusLocalazyLanguage[] = [...directusExpandedLangauges, ...createdExpandedLanguages];

    if (!import_source_language) {
      importLanguages = importLanguages.filter(
        (l) =>
          DirectusLocalazyAdapter.mapLocalazyToDirectusSourceLanguage(
            l.originalForm,
            localazyProject.sourceLanguage,
            settings.source_language,
          ) !== settings.source_language,
      );
    } else {
      importLanguages = importLanguages.map((l) => {
        if (l.localazyForm === localazySourceLanguage) {
          return {
            ...l,
            directusForm: settings.source_language,
          };
        }
        return l;
      });
    }

    importLanguages = uniqWith(importLanguages, (a, b) => a.directusForm === b.directusForm);
    return importLanguages;
  }

  async resolveExportLanguages(settings: Settings) {
    DirectusLocalazyAdapter.initializeMappings(settings.language_mappings || '[]');
    const { language_code_field, language_collection, source_language, upload_existing_translations } = settings;
    const exportLanguages = upload_existing_translations
      ? await this.fetchDirectusLanguages(language_collection, language_code_field)
      : [source_language];

    return exportLanguages;
  }

  static getDirectusSourceLanguageAsLocalazyLanguage(data: GetDirectusSourceLanguageAsLocalazyLanguage) {
    return DirectusLocalazyAdapter.mapDirectusToLocalazySourceLanguage(data.localazySourceLanguage, data.directusSourceLanguage);
  }
}
