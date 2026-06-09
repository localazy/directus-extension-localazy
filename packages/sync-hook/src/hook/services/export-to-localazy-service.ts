import { Project } from '@localazy/api-client';
import { Settings } from '@localazy/directus-common';
import { KeyValueEntry } from '@localazy/directus-common';
import { TranslatableContent } from '@localazy/directus-common';
import { ContentFromCollections } from '@localazy/directus-common';
import { createAsyncQueue } from '@localazy/directus-common';
import { DirectusLocalazyAdapter } from '@localazy/directus-common';
import { trackLocalazyError } from '../functions/track-error';
import { ExportToLocalazyCommonService } from '@localazy/directus-common';
import { LocalazyData } from '@localazy/directus-common';
import type { DirectusLogger } from '../types/directus-services';

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

/**
 * Dispatches translatable content to Localazy as a side-effect. Called exclusively by the
 * Automated export pipeline's `dispatchToLocalazy` adapter — see
 * `extensions/common/services/orchestrator/automated-export-pipeline.ts`.
 *
 * Preconditions guaranteed by the pipeline before dispatch:
 *   - `settings.automated_upload === true`
 *   - `localazyData.access_token` is a non-empty string
 *   - `content.sourceLanguage` is non-empty
 *   - `localazyProject` is a hydrated Localazy project
 * The original defensive early-return covering these has been removed; trust the pipeline.
 */
export class ExportToLocalazyService {
  constructor(private readonly logger: DirectusLogger) {}

  private createExportPromisesForLanguage(options: CreateExportPromisesForLanguage) {
    const { content, language, access_token, projectId } = options;
    const contentChunks = ContentFromCollections.splitContentIntoChunks(content);

    const importPromises = contentChunks.map(
      (chunk) => async () => ExportToLocalazyCommonService.exportToLocalazy(access_token, projectId, chunk, language),
    );

    return importPromises;
  }

  async exportContentToLocalazy(data: ExportContentToLocalazy) {
    const { content, settings, localazyData, localazyProject } = data;
    const { access_token } = localazyData;

    try {
      const { add, execute } = createAsyncQueue();
      const directusSourceLanguageAsLocalazyLanguage = DirectusLocalazyAdapter.mapDirectusToLocalazySourceLanguage(
        localazyProject.sourceLanguage || 0,
        settings.source_language,
      );

      add(
        this.createExportPromisesForLanguage({
          content: content.sourceLanguage,
          language: directusSourceLanguageAsLocalazyLanguage,
          access_token,
          projectId: localazyProject.id,
        }),
      );
      Object.entries(content.otherLanguages).forEach(([language, languageContent]) => {
        add(
          this.createExportPromisesForLanguage({
            content: languageContent,
            language,
            access_token,
            projectId: localazyProject.id,
          }),
        );
      });

      await execute({ delayBetween: 150 });
    } catch (e: unknown) {
      trackLocalazyError(this.logger, e, 'export');
    }
  }
}
