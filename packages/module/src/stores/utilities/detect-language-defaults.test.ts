import { describe, it, expect } from 'vitest';
import type { AppCollection, Field } from '@directus/types';
import { detectLanguageDefaults } from './detect-language-defaults';

const userCollection = (name: string): AppCollection => ({ collection: name }) as AppCollection;
const systemCollection = (name: string): AppCollection => ({ collection: name }) as AppCollection;

const stringField = (collection: string, field: string): Field => ({ collection, field, type: 'string' }) as Field;
const integerField = (collection: string, field: string): Field => ({ collection, field, type: 'integer' }) as Field;

function fieldsMapFactory(...fields: Field[]) {
  return (collection: string) => fields.filter((f) => f.collection === collection);
}

describe('detectLanguageDefaults', () => {
  it('returns the matched collection + code field when both exist', () => {
    const collections = [userCollection('languages'), userCollection('articles')];
    const getFields = fieldsMapFactory(stringField('languages', 'code'), stringField('languages', 'name'));

    expect(detectLanguageDefaults(collections, getFields)).toEqual({
      language_collection: 'languages',
      language_code_field: 'code',
    });
  });

  it('matches case-insensitively on both collection and field name', () => {
    const collections = [userCollection('Languages')];
    const getFields = fieldsMapFactory(stringField('Languages', 'Code'));

    expect(detectLanguageDefaults(collections, getFields)).toEqual({
      language_collection: 'Languages',
      language_code_field: 'Code',
    });
  });

  it('returns just the collection when no `code` field is present', () => {
    const collections = [userCollection('languages')];
    const getFields = fieldsMapFactory(stringField('languages', 'name'));

    expect(detectLanguageDefaults(collections, getFields)).toEqual({
      language_collection: 'languages',
    });
  });

  it('ignores a non-string `code` field', () => {
    const collections = [userCollection('languages')];
    const getFields = fieldsMapFactory(integerField('languages', 'code'));

    expect(detectLanguageDefaults(collections, getFields)).toEqual({
      language_collection: 'languages',
    });
  });

  it('returns an empty object when no user `languages` collection exists', () => {
    const collections = [userCollection('articles'), userCollection('pages')];
    const getFields = fieldsMapFactory();

    expect(detectLanguageDefaults(collections, getFields)).toEqual({});
  });

  it('ignores a `languages` collection in the `directus_` namespace', () => {
    const collections = [systemCollection('directus_languages')];
    const getFields = fieldsMapFactory(stringField('directus_languages', 'code'));

    expect(detectLanguageDefaults(collections, getFields)).toEqual({});
  });

  it('ignores a `languages` collection in the `localazy_` namespace', () => {
    const collections = [systemCollection('localazy_languages')];
    const getFields = fieldsMapFactory(stringField('localazy_languages', 'code'));

    expect(detectLanguageDefaults(collections, getFields)).toEqual({});
  });
});
