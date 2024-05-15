/* eslint-disable class-methods-use-this */
import { Item } from '@directus/types';
import { TranslationString } from '../models/translation-string';
import { Settings } from '../models/collections-data/settings';
import { TranslatableContent } from '../models/translatable-content';
import { LocalazyTranslationStringBlock } from '../models/localazy-content';
import { DirectusApi } from '../interfaces/directus-api';
import { ContentFromTranslationStrings } from './content-for-localazy/content-from-translation-strings-service';

type FetchTranslationStrings = {
  languages: string[];
  synchronizeTranslationStrings: 0 | 1;
  settings: Settings;
};

type Directus10TranslationApiResult = {
  id: string;
  key: string;
  language: string;
  value: string;
};

export class TranslationStringsService {
  private directusApi!: DirectusApi;

  constructor(directusApi: DirectusApi) {
    this.directusApi = directusApi;
  }

  async updateSettings<T extends Item>(payload: T) {
    await this.directusApi.updateSettings(payload);
  }

  normalizeDirectus10TranslationStrings(translationStrings: Directus10TranslationApiResult[]) {
    const translationStringsMap = new Map<string, TranslationString>();

    translationStrings.forEach((translationString) => {
      if (!translationStringsMap.has(translationString.key)) {
        translationStringsMap.set(translationString.key, { key: translationString.key, id: translationString.id, translations: {} });
      }

      const translationStringEntry = translationStringsMap.get(translationString.key)!;
      translationStringEntry.translations[translationString.language] = translationString.value;
    });

    const normalizedTranslationStrings: TranslationString[] = [];
    translationStringsMap.forEach((translationString) => {
      normalizedTranslationStrings.push({
        key: translationString.key,
        id: translationString.id,
        translations: translationString.translations,
      });
    });
    return normalizedTranslationStrings;
  }

  hasDedicatedTranslationsCollection() {
    return !!this.directusApi.getCollection('directus_translations');
  }

  private async fetchTranslationStringsFromSettings() {
    const result = await this.directusApi.fetchSettings();
    const translationStrings = result?.translation_strings;
    return Array.isArray(translationStrings) ? translationStrings : [];
  }

  async resolveTranslationStrings() {
    let translationStrings: TranslationString[] = [];
    if (this.hasDedicatedTranslationsCollection()) {
      try {
        const result = await this.directusApi.fetchTranslationStrings();
        translationStrings = this.normalizeDirectus10TranslationStrings(result as Directus10TranslationApiResult[]);
      } catch (e: any) {
        try {
          translationStrings = await this.fetchTranslationStringsFromSettings();
          return translationStrings;
        } catch (e2: any) {
          return [];
        }
      }
    } else {
      translationStrings = await this.fetchTranslationStringsFromSettings();
    }

    return Array.isArray(translationStrings) ? translationStrings : [];
  }

  async upsertLegacyTranslationStrings(data: LocalazyTranslationStringBlock[]) {
    const result = await this.directusApi.fetchSettings();
    if (result) {
      const translationStrings: TranslationString[] = Array.isArray(result.translation_strings)
        ? result.translation_strings
        : [];

      const payloadMap = new Map();

      translationStrings.forEach((item) => {
        const existingKey: Omit<LocalazyTranslationStringBlock, 'localazyKey'> = payloadMap.get(item.key) || {
          key: item.key,
          translations: {},
        };

        existingKey.translations = {
          ...existingKey.translations,
          ...item.translations,
        };
        payloadMap.set(item.key, existingKey);
      });

      data.forEach((item) => {
        const existingKey = payloadMap.get(item.key) || {
          key: item.key,
          translations: {},
        };

        existingKey.translations = {
          ...existingKey.translations,
          ...item.translations,
        };
        payloadMap.set(item.key, existingKey);
      });
      const payload = Array.from(payloadMap.values());

      if (payload.length === 0) {
        return;
      }

      await this.updateSettings({
        translation_strings: payload,
      });
    }
  }

  async upsertNewTranslationStrings(data: LocalazyTranslationStringBlock[]) {
    const result = await this.directusApi.fetchTranslationStrings();

    const translationStrings: Directus10TranslationApiResult[] = Array.isArray(result)
      ? result as Directus10TranslationApiResult[]
      : [];

    const existingStrings: Directus10TranslationApiResult[] = [];
    const newStrings: Omit<Directus10TranslationApiResult, 'id'>[] = [];

    data.forEach((item) => {
      Object.entries(item.translations).forEach(([language, value]) => {
        const directusKey = item.key.split('.')[0] || item.key;
        const existingString = translationStrings.find((s) => s.key === directusKey && s.language === language);
        const hasChanged = existingString && existingString.value !== value;
        if (existingString) {
          if (hasChanged) {
            existingStrings.push({
              ...existingString,
              value,
            });
          }
        } else {
          newStrings.push({
            key: directusKey,
            language,
            value,
          });
        }
      });
    });

    if (existingStrings.length > 0) {
      existingStrings.forEach(async (item) => {
        await this.directusApi.upsertTranslationString({
          id: item.id,
          value: item.value,
        });
      });
    }
    if (newStrings.length > 0) {
      newStrings.forEach(async (item) => {
        await this.directusApi.upsertTranslationString(item);
      });
    }
  }

  async upsertTranslationStrings(data: LocalazyTranslationStringBlock[]) {
    if (data.length === 0) {
      return;
    }

    if (this.hasDedicatedTranslationsCollection()) {
      await this.upsertNewTranslationStrings(data);
    } else {
      await this.upsertLegacyTranslationStrings(data);
    }
  }

  buildTranslatableContent(translationStrings: TranslationString[], languages: string[], settings: Settings) {
    const translatableContent: TranslatableContent = ContentFromTranslationStrings.createContentFromTranslationStrings({
      translationStrings,
      settings,
      enabledLanguages: languages,
    });

    return translatableContent;
  }

  async fetchTranslationStrings(options: FetchTranslationStrings): Promise<TranslatableContent> {
    if (options.synchronizeTranslationStrings === 0) {
      return {
        sourceLanguage: {},
        otherLanguages: {},
      };
    }

    const { settings } = options;
    const translationStrings = await this.resolveTranslationStrings();

    return this.buildTranslatableContent(translationStrings, options.languages, settings);
  }
}
