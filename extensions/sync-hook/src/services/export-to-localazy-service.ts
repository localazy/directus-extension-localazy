/* eslint-disable class-methods-use-this */
import { isEmpty } from 'lodash';
import { Project } from '@localazy/api-client';
import { Settings } from '../../../common/models/collections-data/settings';
import { KeyValueEntry } from '../../../common/models/localazy-key-entry';
import { TranslatableContent } from '../../../common/models/translatable-content';
import { ContentFromCollections } from '../../../common/utilities/content-from-collections-service';
import { useEnhancedAsyncQueue } from '../../../module/src/composables/use-async-queue';
import { DirectusLocalazyAdapter } from '../../../common/services/directus-localazy-adapter';
import { LocalazyApiThrottleService } from '../../../common/services/localazy-api-throttle-service';
import { trackLocalazyError } from '../functions/track-error';
import { ExportToLocalazyCommonService } from '../../../common/services/export-to-localazy-common-service';
import { LocalazyData } from '../../../common/models/collections-data/localazy-data';

type ExportContentToLocalazy = {
  content: TranslatableContent;
  settings: Settings;
  localazyData: LocalazyData;
  localazyProject: Project;
};

type CreateExportPromisesForLanguage = {
  content: KeyValueEntry;
  language: string;
  access_token: string;
  projectId: string;
};

export class ExportToLocalazyService {
  private async loadProject(token: string) {
    if (!token) {
      return null;
    }

    try {
      const projects = await LocalazyApiThrottleService.listProjects(token, { organization: true, languages: true });
      const localazyProject = projects[0] || null;
      return localazyProject;
    } catch (e: any) {
      trackLocalazyError(e, 'loadProject');
      return null;
    }
  }

  private createExportPromisesForLanguage(options: CreateExportPromisesForLanguage) {
    const {
      content, language, access_token, projectId,
    } = options;
    const contentChunks = ContentFromCollections.splitContentIntoChunks(content);

    const importPromises = contentChunks.map(
      (chunk) => async () => ExportToLocalazyCommonService.exportToLocalazy(access_token, projectId, chunk, language),
    );

    return importPromises;
  }

  async exportContentToLocalazy(data: ExportContentToLocalazy) {
    const {
      content, settings, localazyData, localazyProject,
    } = data;
    const { automated_upload } = settings;
    const { access_token } = localazyData;
    if (!access_token || isEmpty(content.sourceLanguage) || !settings || !automated_upload) {
      return;
    }

    try {
      const { add, execute } = useEnhancedAsyncQueue();

      if (localazyProject) {
        const directusSourceLanguageAsLocalazyLanguage = DirectusLocalazyAdapter
          .mapDirectusToLocalazySourceLanguage(localazyProject.sourceLanguage || 0, settings.source_language);

        add(this.createExportPromisesForLanguage({
          content: content.sourceLanguage,
          language: directusSourceLanguageAsLocalazyLanguage,
          access_token,
          projectId: localazyProject.id,
        }));
        Object.entries(content.otherLanguages).forEach(([language, languageContent]) => {
          add(this.createExportPromisesForLanguage({
            content: languageContent,
            language,
            access_token,
            projectId: localazyProject.id,
          }));
        });

        await execute({ delayBetween: 150 });
      }
    } catch (e: any) {
      trackLocalazyError(e, 'export');
    }
  }
}
