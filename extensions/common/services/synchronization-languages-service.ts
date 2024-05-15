/* eslint-disable class-methods-use-this */
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
    return result.map((item: any) => item[languageCodeField]);
  }

  async createLanguages(settings: Settings, localazyLanguages: Language[]) {
    const { language_code_field, language_collection } = settings;
    localazyLanguages.forEach(async (language) => {
      await this.directusApi.createDirectusItem(language_collection, {
        [language_code_field]: language.code,
        name: language.name,
      });
    });
  }

  async resolveImportLanguages(settings: Settings, localazyProject: Project): Promise<DirectusLocalazyLanguage[]> {
    const { language_code_field, language_collection, import_source_language } = settings;
    const directusLanguages = await this.fetchDirectusLanguages(language_collection, language_code_field);
    const localazyLanguages = localazyProject.languages || [];
    const localazySourceLanguage = getLocalazyLanguages()
      .find((lang) => lang.localazyId === localazyProject.sourceLanguage)?.locale || '';

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
        .filter((l: any) => settings.create_missing_languages_in_directus === CreateMissingLanguagesInDirectus.ALL || l.enabled);
      await this.createLanguages(settings, localazyLanguagesNotInDirectus);
    }

    if (!import_source_language) {
      importLanguages = importLanguages.filter((l) => DirectusLocalazyAdapter.mapLocalazyToDirectusSourceLanguage(
        l.originalForm,
        localazyProject.sourceLanguage,
        settings.source_language,
      ) !== settings.source_language);
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
    const {
      language_code_field, language_collection, source_language, upload_existing_translations,
    } = settings;
    const exportLanguages = upload_existing_translations
      ? await this.fetchDirectusLanguages(language_collection, language_code_field)
      : [source_language];

    return exportLanguages;
  }

  static getDirectusSourceLanguageAsLocalazyLanguage(data: GetDirectusSourceLanguageAsLocalazyLanguage) {
    return DirectusLocalazyAdapter
      .mapDirectusToLocalazySourceLanguage(data.localazySourceLanguage, data.directusSourceLanguage);
  }
}
