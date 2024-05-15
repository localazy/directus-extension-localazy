/* eslint-disable class-methods-use-this */
import { uniqWith } from 'lodash';
import { Locales, Project } from '@localazy/api-client';
import { LocalazyApiThrottleService } from './localazy-api-throttle-service';
import { DirectusLocalazyLanguage } from '../models/directus-localazy-language';
import { ContentFromLocalazyService } from './content-from-localazy-service';
import { EnabledField } from '../models/collections-data/content-transfer-setup';
import { LocalazyData } from '../models/collections-data/localazy-data';

type FetchContentInLanguage = {
  lang: DirectusLocalazyLanguage;
  directusFileId: string;
  localazyProject: Project;
  access_token: string;
};

type ImportContentFromLocalazy = {
  languages: DirectusLocalazyLanguage[];
  enabledFields: EnabledField[];
  localazyData: LocalazyData;
  localazyProject: Project;

  progressCallbacks: {
    nothingToImport: () => void;
    couldNotFetchContent: (language: string) => void;
  }
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
    const {
      languages, enabledFields, progressCallbacks, localazyProject, localazyData,
    } = data;

    const uniqueLocalazyFormLanguages = uniqWith(languages, (a, b) => a.localazyForm === b.localazyForm);
    const directusFile = await this.loadFile(localazyData.access_token, localazyProject?.id || '');

    if (!directusFile) {
      progressCallbacks.nothingToImport();
      return { success: false };
    }

    if (localazyProject && directusFile) {
      const sourceKeysPerLanguage = (await Promise.all(uniqueLocalazyFormLanguages
        .map((lang) => this.fetchContentInLanguage({
          lang,
          directusFileId: directusFile.id,
          localazyProject,
          access_token: localazyData.access_token,
        }, progressCallbacks))))
        .flat();

      return {
        success: true,
        content: ContentFromLocalazyService.parseLocalazyContent(sourceKeysPerLanguage, enabledFields),
      };
    }
    return { success: false };
  }

  private async loadFile(token: string, projectId: string) {
    if (!token) {
      return null;
    }

    if (token) {
      try {
        const files = await LocalazyApiThrottleService.listFiles(token, {
          project: projectId,
        });
        return files.find((file) => file.name === 'directus.json') || null;
      } catch (e: any) {
        return null;
      }
    } else {
      return null;
    }
  }

  private async fetchContentInLanguage(data: FetchContentInLanguage, progressCallbacks: ImportContentFromLocalazy['progressCallbacks']) {
    const {
      lang, directusFileId, localazyProject, access_token,
    } = data;
    const keys = await LocalazyApiThrottleService.listAllKeysInFileForLanguage(access_token, {
      project: localazyProject.id,
      file: directusFileId,
      lang: lang.localazyForm as Locales,
    }).catch((e) => {
      progressCallbacks.couldNotFetchContent(lang.directusForm);
      throw (e);
    });
    return {
      language: lang.directusForm,
      keys,
    };
  }
}

export const importFromLocalazyService = new ImportFromLocalazyService();
