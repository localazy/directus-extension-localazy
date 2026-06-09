import { describe, it, expect } from 'vitest';
import { Key } from '@localazy/api-client';
import { LocalazyContent, LocalazyTranslationStringBlock } from '@localazy/directus-common';
import { projectCollectionDeprecationKeys, projectTranslationStringsDeprecationKeys } from './deprecation-key-projectors';

function makeLocalazyKey(id: string): Key {
  return { id } as Key;
}

function makeTranslationString(
  overrides: Pick<LocalazyTranslationStringBlock, 'directusId' | 'localazyKeys'>,
): LocalazyTranslationStringBlock {
  return { key: overrides.directusId, translations: {}, ...overrides };
}

describe('projectCollectionDeprecationKeys', () => {
  it('returns every Localazy key id belonging to a deleted Directus item across all languages', () => {
    const content: LocalazyContent = {
      translationStrings: new Map(),
      collections: new Map([
        [
          'articles',
          {
            translationFields: ['title'],
            items: {
              1: [
                {
                  language: 'en',
                  items: [{ translationField: 'translations', field: 'title', value: 'A', localazyKey: makeLocalazyKey('en-1-title') }],
                },
                {
                  language: 'de',
                  items: [{ translationField: 'translations', field: 'title', value: 'A-de', localazyKey: makeLocalazyKey('de-1-title') }],
                },
              ],
              2: [
                {
                  language: 'en',
                  items: [{ translationField: 'translations', field: 'title', value: 'B', localazyKey: makeLocalazyKey('en-2-title') }],
                },
              ],
            },
          },
        ],
      ]),
    };

    const ids = projectCollectionDeprecationKeys('articles')({ importContent: content, itemIds: ['1'] });

    expect(new Set(ids)).toEqual(new Set(['en-1-title', 'de-1-title']));
  });

  it('returns an empty array when the collection has no entries in importContent', () => {
    const content: LocalazyContent = { translationStrings: new Map(), collections: new Map() };

    const ids = projectCollectionDeprecationKeys('articles')({ importContent: content, itemIds: ['1'] });

    expect(ids).toEqual([]);
  });

  it('ignores items whose Directus id is not in the deleted set', () => {
    const content: LocalazyContent = {
      translationStrings: new Map(),
      collections: new Map([
        [
          'articles',
          {
            translationFields: ['title'],
            items: {
              1: [
                {
                  language: 'en',
                  items: [{ translationField: 'translations', field: 'title', value: 'keep', localazyKey: makeLocalazyKey('keep-key') }],
                },
              ],
              2: [
                {
                  language: 'en',
                  items: [{ translationField: 'translations', field: 'title', value: 'drop', localazyKey: makeLocalazyKey('drop-key') }],
                },
              ],
            },
          },
        ],
      ]),
    };

    const ids = projectCollectionDeprecationKeys('articles')({ importContent: content, itemIds: ['2'] });

    expect(ids).toEqual(['drop-key']);
  });
});

describe('projectTranslationStringsDeprecationKeys', () => {
  it('emits one Localazy key id per language for each deleted translation string', () => {
    const content: LocalazyContent = {
      translationStrings: new Map([
        ['kept', makeTranslationString({ directusId: 'kept-id', localazyKeys: { en: makeLocalazyKey('lk-kept') } })],
        [
          'deleted-a',
          makeTranslationString({
            directusId: 'deleted-id-a',
            localazyKeys: { en: makeLocalazyKey('lk-a-en'), de: makeLocalazyKey('lk-a-de') },
          }),
        ],
        ['deleted-b', makeTranslationString({ directusId: 'deleted-id-b', localazyKeys: { en: makeLocalazyKey('lk-b') } })],
      ]),
      collections: new Map(),
    };

    const ids = projectTranslationStringsDeprecationKeys({
      importContent: content,
      itemIds: ['deleted-id-a', 'deleted-id-b'],
    });

    expect(new Set(ids)).toEqual(new Set(['lk-a-en', 'lk-a-de', 'lk-b']));
  });

  it('returns an empty array when no translation strings match the deleted itemIds', () => {
    const content: LocalazyContent = {
      translationStrings: new Map([
        ['kept', makeTranslationString({ directusId: 'kept-id', localazyKeys: { en: makeLocalazyKey('lk-kept') } })],
      ]),
      collections: new Map(),
    };

    const ids = projectTranslationStringsDeprecationKeys({ importContent: content, itemIds: ['nope'] });

    expect(ids).toEqual([]);
  });
});
