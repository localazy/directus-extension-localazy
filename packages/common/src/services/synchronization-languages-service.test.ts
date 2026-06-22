import { describe, expect, it, vi } from 'vitest';
import { Project } from '@localazy/api-client';
import { SynchronizationLanguagesService } from './synchronization-languages-service';
import { DirectusApi } from '../interfaces/directus-api';
import { CreateMissingLanguagesInDirectus } from '../enums/create-missing-languages-in-directus';
import { Settings } from '../models/collections-data/settings';

/**
 * Regression coverage for the import language-resolution gate. A Localazy project language
 * that has no backing row in the Directus languages collection must only end up in the
 * import set when the `create_missing_languages_in_directus` setting actually creates it —
 * otherwise the orchestrator would write `*_translations` rows whose `languages_code` has
 * no parent row and Directus rejects them with `Invalid foreign key "ja" …`.
 */
describe('SynchronizationLanguagesService.resolveImportLanguages — missing-language gate', () => {
  const LANGUAGE_COLLECTION = 'languages';
  const LANGUAGE_CODE_FIELD = 'code';

  // Directus has en + cs; the Localazy project additionally offers ja (missing from Directus).
  function buildProject(): Project {
    return {
      languages: [
        { code: 'en', name: 'English' },
        { code: 'cs', name: 'Czech' },
        { code: 'ja', name: 'Japanese' },
      ],
      sourceLanguage: 0,
    } as unknown as Project;
  }

  function buildSettings(mode: CreateMissingLanguagesInDirectus): Settings {
    return {
      language_collection: LANGUAGE_COLLECTION,
      language_code_field: LANGUAGE_CODE_FIELD,
      language_mappings: '[]',
      // `true` keeps every resolved language (the source-language remap branch) so the test
      // asserts purely on the missing-language gate, not on source-language filtering.
      import_source_language: true,
      source_language: 'en',
      create_missing_languages_in_directus: mode,
    } as unknown as Settings;
  }

  function buildApi() {
    const createDirectusItem = vi.fn().mockResolvedValue(undefined);
    const api = {
      fetchDirectusItems: vi.fn().mockResolvedValue([{ [LANGUAGE_CODE_FIELD]: 'en' }, { [LANGUAGE_CODE_FIELD]: 'cs' }]),
      createDirectusItem,
    } as unknown as DirectusApi;
    return { api, createDirectusItem };
  }

  it('skips a missing language (does not import or create it) when the setting is NO', async () => {
    const { api, createDirectusItem } = buildApi();
    const service = new SynchronizationLanguagesService(api);

    const result = await service.resolveImportLanguages(buildSettings(CreateMissingLanguagesInDirectus.NO), buildProject());

    const directusForms = result.map((l) => l.directusForm).sort();
    expect(directusForms).toEqual(['cs', 'en']);
    expect(directusForms).not.toContain('ja');
    expect(createDirectusItem).not.toHaveBeenCalled();
  });

  it('creates and imports a missing language when the setting is ALL', async () => {
    const { api, createDirectusItem } = buildApi();
    const service = new SynchronizationLanguagesService(api);

    const result = await service.resolveImportLanguages(buildSettings(CreateMissingLanguagesInDirectus.ALL), buildProject());

    expect(result.map((l) => l.directusForm).sort()).toEqual(['cs', 'en', 'ja']);
    expect(createDirectusItem).toHaveBeenCalledTimes(1);
    expect(createDirectusItem).toHaveBeenCalledWith(LANGUAGE_COLLECTION, expect.objectContaining({ [LANGUAGE_CODE_FIELD]: 'ja' }));
  });

  it('skips a missing language under ONLY_NON_HIDDEN (the create filter is inert, so nothing is created)', async () => {
    const { api, createDirectusItem } = buildApi();
    const service = new SynchronizationLanguagesService(api);

    const result = await service.resolveImportLanguages(buildSettings(CreateMissingLanguagesInDirectus.ONLY_NON_HIDDEN), buildProject());

    expect(result.map((l) => l.directusForm).sort()).toEqual(['cs', 'en']);
    expect(createDirectusItem).not.toHaveBeenCalled();
  });
});
