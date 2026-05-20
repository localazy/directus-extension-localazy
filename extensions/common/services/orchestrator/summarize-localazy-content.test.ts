import { describe, it, expect } from 'vitest';
import type { Key } from '@localazy/api-client';
import { LocalazyContent, LocalazyCollectionBlock, LocalazyTranslationStringBlock } from '../../models/localazy-content';
import { summarizeLocalazyContent } from './summarize-localazy-content';

const k = (id: string, event = 0): Key => ({ id, key: ['k'], value: 'v', event }) as Key;

function makeCollectionBlock(items: Record<string, Array<{ language: string; fields: string[] }>>): LocalazyCollectionBlock {
  const block: LocalazyCollectionBlock = { translationFields: ['translations'], items: {} };
  for (const [itemId, perLangList] of Object.entries(items)) {
    block.items[Number(itemId)] = perLangList.map(({ language, fields }) => ({
      language,
      items: fields.map((field) => ({ field, translationField: 'translations', value: 'val', localazyKey: k(`${language}-${field}`) })),
    }));
  }
  return block;
}

function makeTranslationStringBlock(key: string, translations: Record<string, string>): LocalazyTranslationStringBlock {
  return {
    key,
    directusId: '',
    localazyKeys: Object.fromEntries(Object.keys(translations).map((lang) => [lang, k(`${key}-${lang}`)])),
    translations,
  };
}

describe('summarizeLocalazyContent', () => {
  it('returns all zeroes for an empty payload', () => {
    const content: LocalazyContent = { collections: new Map(), translationStrings: new Map() };
    expect(summarizeLocalazyContent(content)).toEqual({ changes: 0, items: 0, collections: 0, languages: 0 });
  });

  it('counts collections, items, languages and changes for a single collection', () => {
    const content: LocalazyContent = {
      collections: new Map([
        [
          'posts',
          makeCollectionBlock({
            '1': [
              { language: 'fr', fields: ['title', 'body'] },
              { language: 'de', fields: ['title'] },
            ],
            '2': [{ language: 'fr', fields: ['title'] }],
          }),
        ],
      ]),
      translationStrings: new Map(),
    };
    expect(summarizeLocalazyContent(content)).toEqual({
      changes: 2 + 1 + 1, // fr+de on item 1, fr on item 2
      items: 2,
      collections: 1,
      languages: 2,
    });
  });

  it('counts translation-string keys as items and counts each language as one change', () => {
    const content: LocalazyContent = {
      collections: new Map(),
      translationStrings: new Map([
        ['greeting', makeTranslationStringBlock('greeting', { fr: 'Bonjour', de: 'Hallo' })],
        ['farewell', makeTranslationStringBlock('farewell', { fr: 'Au revoir' })],
      ]),
    };
    expect(summarizeLocalazyContent(content)).toEqual({
      changes: 3,
      items: 2,
      collections: 0,
      languages: 2,
    });
  });

  it('merges language sets across collections and translation strings', () => {
    const content: LocalazyContent = {
      collections: new Map([['posts', makeCollectionBlock({ '1': [{ language: 'fr', fields: ['title'] }] })]]),
      translationStrings: new Map([['greeting', makeTranslationStringBlock('greeting', { de: 'Hallo' })]]),
    };
    expect(summarizeLocalazyContent(content).languages).toBe(2);
  });

  it('counts distinct collections separately', () => {
    const content: LocalazyContent = {
      collections: new Map([
        ['posts', makeCollectionBlock({ '1': [{ language: 'fr', fields: ['title'] }] })],
        ['pages', makeCollectionBlock({ '1': [{ language: 'fr', fields: ['title'] }] })],
      ]),
      translationStrings: new Map(),
    };
    expect(summarizeLocalazyContent(content).collections).toBe(2);
  });
});
