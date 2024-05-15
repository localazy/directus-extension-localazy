import { uniq } from 'lodash';
import { Key } from '@localazy/api-client';
import { LocalazyCollectionItem, LocalazyContent } from '../../../common/models/localazy-content';
import { mergeWithArrays } from '../../../common/utilities/merge-with-arrays';
import { KeysInLanguage } from '../../../common/models/keys-in-language';
import { EnabledField } from '../../../common/models/collections-data/content-transfer-setup';
import { FieldsUtilsService } from '../../../common/utilities/fields-utils-service';

type ParseCollectionItemData = {
  collection: string;
  itemId: string | number;
  translationField: string;
  field: string;
  language: string;
  key: Key;
  enabledFields: EnabledField[];
};

type ParseTranslationStringItem = {
  key: Key;
  language: string;
};

export class ContentFromLocalazyService {
  static parseLocalazyContent(keysInLangage: KeysInLanguage[], enabledFields: EnabledField[]): LocalazyContent {
    const existingContentMap: LocalazyContent = {
      translationStrings: new Map(),
      collections: new Map(),
    };

    keysInLangage.forEach(({ language, keys }) => {
      keys.forEach((key) => {
        const [collection, itemId, translationField, field] = key.key;
        if (collection && itemId && field && translationField) {
          this.parseCollectionItem(
            {
              collection, itemId, translationField, field, language, key, enabledFields,
            },
            existingContentMap.collections,
          );
        } else if (key.key.toString().startsWith('translation_string')) {
          this.parseTranslationStringItem(
            {
              language,
              key,
            },
            existingContentMap.translationStrings,
          );
        }
      });
    });

    return existingContentMap;
  }

  private static parseTranslationStringItem(data: ParseTranslationStringItem, translationStrings: LocalazyContent['translationStrings']) {
    const directusKey = data.key.key[1] || '';
    const directusId = data.key.key[2] || '';
    const translationStringKey = translationStrings.get(directusKey) || {
      key: directusKey,
      translations: {},
    };

    translationStrings.set(directusKey, {
      ...translationStringKey,
      localazyKey: data.key,
      directusId,
      translations: {
        ...translationStringKey.translations,
        [data.language]: data.key.value.toString(),
      },
    });
  }

  private static parseCollectionItem(data: ParseCollectionItemData, existingContentMap: LocalazyContent['collections']) {
    const {
      collection, itemId, translationField, field, language, key, enabledFields,
    } = data;
    if (!FieldsUtilsService.isEnabledField(field, collection, enabledFields)) {
      return;
    }

    const items = existingContentMap.get(collection) || { translationFields: [], items: {} };
    items.translationFields = uniq([...items.translationFields, translationField]);

    existingContentMap.set(collection, mergeWithArrays(items, {
      items: {
        [itemId]: [
          {
            language,
            items: [{
              field,
              translationField,
              value: key.value,
              localazyKey: key,
            } as LocalazyCollectionItem],
          }],
      },
    }));
  }
}
