import { getLocalazyLanguages } from '@localazy/languages';
import { Language, Project } from '@localazy/api-client';
import { uniqWith } from 'lodash';
import { DirectusApi } from '../interfaces/directus-api';
import { CreateMissingLanguagesInDirectus } from '../enums/create-missing-languages-in-directus';
import { Settings } from '../models/collections-data/settings';
import { DirectusLocalazyLanguage } from '../models/directus-localazy-language';
import { DirectusLocalazyAdapter } from './directus-localazy-adapter';

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

    const localazyExpandedLanguages = localazyLanguages.map((localazyLanguage) => ({
      originalForm: localazyLanguage.code,
      directusForm: DirectusLocalazyAdapter.transformLocalazyToDirectusPreferedFormLanguage(localazyLanguage.code),
      localazyForm: localazyLanguage.code,
    }));
    let importLanguages: DirectusLocalazyLanguage[] = [...directusExpandedLangauges];
    localazyExpandedLanguages.forEach((localazyLanguage) => {
      const languageExistsInDirectus = importLanguages.find((l) => l.originalForm === localazyLanguage.originalForm);
      const localazyFormInDirectusExists = importLanguages.find((l) => l.localazyForm === localazyLanguage.originalForm);
      if (!languageExistsInDirectus && !localazyFormInDirectusExists) {
        importLanguages.push(localazyLanguage);
      }
    });

    if (settings.create_missing_languages_in_directus !== CreateMissingLanguagesInDirectus.NO) {
      const localazyLanguagesNotInDirectus = localazyLanguages
        .filter((l) => !directusExpandedLangauges.some((directusLanguage) => directusLanguage.localazyForm === l.code))
        // Note: `enabled` isn't on @localazy/api-client's Language type. At runtime this
        // access is always undefined, so the filter effectively only lets languages through
        // when create_missing_languages_in_directus === ALL. Preserving existing behavior;
        // the underlying "filter by enabled" logic was already inert.
        .filter(
          (l) =>
            settings.create_missing_languages_in_directus === CreateMissingLanguagesInDirectus.ALL || (l as { enabled?: boolean }).enabled,
        );
      await this.createLanguages(settings, localazyLanguagesNotInDirectus);
    }

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
