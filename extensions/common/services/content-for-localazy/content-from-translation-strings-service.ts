import { merge } from 'lodash';
import { Settings } from '../../models/collections-data/settings';
import { TranslatableContent } from '../../models/translatable-content';
import { ContentForLocalazyBase } from './content-for-localazy-base';
import { TranslationString } from '../../models/translation-string';

type CreateContentFromTranslationStrings = {
  translationStrings: TranslationString[];
  settings: Settings;
  enabledLanguages: string[];
};

export class ContentFromTranslationStrings extends ContentForLocalazyBase {
  static createContentFromTranslationStrings(data: CreateContentFromTranslationStrings) {
    const { translationStrings, settings } = data;
    const translatableContent: TranslatableContent = { sourceLanguage: {}, otherLanguages: {} };

    translationStrings.forEach((translationString) => {
      Object.entries(translationString.translations).forEach(([locale, translation]) => {
        if (!data.enabledLanguages.includes(locale)) {
          return;
        }

        const isSourceLanguageItem = settings.source_language === locale;
        if (!isSourceLanguageItem && !translatableContent.otherLanguages[locale]) {
          translatableContent.otherLanguages[locale] = {};
        }

        const sourceObject = isSourceLanguageItem
          ? translatableContent.sourceLanguage
          : translatableContent.otherLanguages[locale];

        if (sourceObject && !sourceObject.translationString) {
          sourceObject.translation_string = {};
        }

        merge(sourceObject, {
          translation_string: {
            [translationString.key]: {
              [translationString.id]: translation,
            },
          },
        });
      });
    });

    return translatableContent;
  }
}
