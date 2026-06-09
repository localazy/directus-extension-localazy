import { uniqWith } from 'lodash';
import { Key, Locales, Project } from '@localazy/api-client';
import { LocalazyApiThrottleService } from '@localazy/directus-common';
import { DirectusLocalazyLanguage } from '@localazy/directus-common';
import { ContentFromLocalazyService } from './content-from-localazy-service';
import { EnabledField } from '@localazy/directus-common';
import { LocalazyData } from '@localazy/directus-common';

type FetchContentInLanguage = {
  lang: DirectusLocalazyLanguage;
  directusFileId: string;
  localazyProject: Project;
  access_token: string;
};

/**
 * Reduces a per-language keys list immediately after fetch, before the
 * `ContentFromLocalazyService` parser runs. Used by the incremental-sync flow to drop
 * keys that haven't changed since the last sync (cursor-filtered). When omitted the
 * service behaves as before — pass-through everything.
 */
type FilterKeysForLanguage = (language: string, keys: Key[]) => Key[];

type ImportContentFromLocalazy = {
  languages: DirectusLocalazyLanguage[];
  enabledFields: EnabledField[];
  localazyData: LocalazyData;
  localazyProject: Project;

  progressCallbacks: {
    nothingToImport: () => void;
    couldNotFetchContent: (language: string) => void;
  };

  /**
   * Optional. Called per language with the raw key list straight from Localazy; returns
   * the subset that should reach the parser. The default (no filter) keeps every key.
   */
  filterKeysForLanguage?: FilterKeysForLanguage;
};

type ImportContentFromLocalazySuccessReturn = {
  success: true;
  content: ReturnType<typeof ContentFromLocalazyService.parseLocalazyContent>;
};

type ImportContentFromLocalazyErrorReturn = {
  success: false;
};

type ImportContentFromLocalazyReturn = ImportContentFromLocalazySuccessReturn | ImportContentFromLocalazyErrorReturn;

class ImportFromLocalazyService {
  async importContentFromLocalazy(data: ImportContentFromLocalazy): Promise<ImportContentFromLocalazyReturn> {
    const { languages, enabledFields, progressCallbacks, localazyProject, localazyData, filterKeysForLanguage } = data;

    const uniqueLocalazyFormLanguages = uniqWith(languages, (a, b) => a.localazyForm === b.localazyForm);
    const directusFile = await this.loadFile(localazyData.access_token, localazyProject?.id || '');

    if (!directusFile) {
      progressCallbacks.nothingToImport();
      return { success: false };
    }

    if (localazyProject && directusFile) {
      const sourceKeysPerLanguage = await Promise.all(
        uniqueLocalazyFormLanguages.map((lang) =>
          this.fetchContentInLanguage(
            {
              lang,
              directusFileId: directusFile.id,
              localazyProject,
              access_token: localazyData.access_token,
            },
            progressCallbacks,
          ),
        ),
      );

      // Apply the cursor filter (if any) immediately after fetch and before the parser —
      // the parser shouldn't know or care about incremental sync.
      const filtered = filterKeysForLanguage
        ? sourceKeysPerLanguage.map(({ language, keys }) => ({ language, keys: filterKeysForLanguage(language, keys) }))
        : sourceKeysPerLanguage;

      return {
        success: true,
        content: ContentFromLocalazyService.parseLocalazyContent(filtered, enabledFields),
      };
    }
    return { success: false };
  }

  private async loadFile(token: string, projectId: string) {
    if (!token) {
      return null;
    }
    try {
      const files = await LocalazyApiThrottleService.listFiles(token, {
        project: projectId,
      });
      return files.find((file) => file.name === 'directus.json') || null;
    } catch {
      return null;
    }
  }

  private async fetchContentInLanguage(data: FetchContentInLanguage, progressCallbacks: ImportContentFromLocalazy['progressCallbacks']) {
    const { lang, directusFileId, localazyProject, access_token } = data;
    // `event: true` makes Localazy include the per-key modification `event` number on the
    // response, which the cursor filter uses to drop already-synced keys. The API ignores
    // the flag when the server doesn't support it, and the cursor's safe-mode rule
    // (undefined event = always include) means we degrade gracefully.
    const keys = await LocalazyApiThrottleService.listAllKeysInFileForLanguage(access_token, {
      project: localazyProject.id,
      file: directusFileId,
      lang: lang.localazyForm as Locales,
      event: true,
    }).catch((e) => {
      progressCallbacks.couldNotFetchContent(lang.directusForm);
      throw e;
    });
    return {
      language: lang.directusForm,
      keys,
    };
  }
}

export const importFromLocalazyService = new ImportFromLocalazyService();
