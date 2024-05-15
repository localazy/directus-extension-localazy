import { SchemaOverview } from '@directus/types';
import { Project } from '@localazy/api-client';
import { Settings } from '../../../../common/models/collections-data/settings';
import { trackLocalazyError, trackDirectusError } from '../../functions/track-error';
import { SynchronizationLanguagesService } from '../../../../common/services/synchronization-languages-service';
import { TranslatableContent } from '../../../../common/models/translatable-content';
import { ExportToLocalazyService } from '../export-to-localazy-service';
import { importFromLocalazyService } from '../import-from-localazy-service';
import { ContentTransferSetupDatabase } from '../../../../common/models/collections-data/content-transfer-setup';
import { EnabledFieldsService } from '../../../../common/utilities/enabled-fields-service';
import { useEnhancedAsyncQueue } from '../../../../module/src/composables/use-async-queue';
import { LocalazyApiThrottleService } from '../../../../common/services/localazy-api-throttle-service';
import { DirectusLocalazyLanguage } from '../../../../common/models/directus-localazy-language';
import { DirectusLocalazyAdapter } from '../../../../common/services/directus-localazy-adapter';
import { LocalazyPaymentStatus } from '../../../../common/utilities/localazy-payment-status';
import { LocalazyData } from '../../../../common/models/collections-data/localazy-data';

type ExportToLocalazy = {
  schema: SchemaOverview;
  content: TranslatableContent;
  settings: Settings;
  localazyData: LocalazyData;
  localazyProject: Project;
};

type FetchLocalazyContent = {
  languages: DirectusLocalazyLanguage[];
  schema: SchemaOverview;
  ItemsService: any;
  localazyProject?: Project;
  settings?: Settings | null;
  localazyData?: LocalazyData | null;
  contentTransferSetup?: ContentTransferSetupDatabase | null;
};

export abstract class BaseContentSynchronizationService {
  protected missingLocalazyCollections(schema: SchemaOverview | null) {
    return !(!!schema?.collections?.localazy_settings && !!schema?.collections?.localazy_content_transfer_setup);
  }

  protected shouldDisableSyncOperations(localazyProject: Project | null) {
    return LocalazyPaymentStatus.shouldDisableSyncOperations(localazyProject);
  }

  protected async loadProject(token: string) {
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

  protected async resolveLocalazySettings(ItemsService: any, schema: SchemaOverview) {
    try {
      const localazySettings = new ItemsService('localazy_settings', { schema });
      const localazyContentTransferSetup = new ItemsService('localazy_content_transfer_setup', { schema });
      const settings: Settings = (await localazySettings.readByQuery({
        fields: '*',
        limit: 1,
      }))[0];
      const contentTransferSetup: ContentTransferSetupDatabase = (await localazyContentTransferSetup.readByQuery({
        fields: '*',
        limit: 1,
      }))[0];

      return {
        settings,
        contentTransferSetup,
      };
    } catch (e: any) {
      trackLocalazyError(e, 'resolveLocalazySettings');
      return {
        settings: null,
        contentTransferSetup: null,
      };
    }
  }

  protected async resolveLocalazyData(ItemsService: any, schema: SchemaOverview) {
    try {
      const localazyData = new ItemsService('localazy_config_data', { schema });
      const data: LocalazyData = (await localazyData.readByQuery({
        fields: '*',
        limit: 1,
      }))[0];

      return {
        localazyData: data,
      };
    } catch (e: any) {
      trackLocalazyError(e, 'resolveLocalazyData');
      return {
        localazyData: null,
      };
    }
  }

  async fetchLocalazyContentInSourceLanguage(options: Omit<FetchLocalazyContent, 'languages'>) {
    const {
      schema, ItemsService, settings, contentTransferSetup, localazyProject, localazyData,
    } = options;

    let resolvedSettings = settings || null;
    let resolvedContentTransferSetup = contentTransferSetup || null;
    let resolvedLocalazyData = localazyData || null;

    if (!resolvedSettings || !resolvedContentTransferSetup) {
      const result = await this.resolveLocalazySettings(ItemsService, schema);
      resolvedSettings = result.settings;
      resolvedContentTransferSetup = result.contentTransferSetup;
    }

    if (!resolvedLocalazyData) {
      const result = await this.resolveLocalazyData(ItemsService, schema);
      resolvedLocalazyData = result.localazyData;
    }

    if (!resolvedSettings || !resolvedContentTransferSetup || !resolvedLocalazyData) {
      return null;
    }

    const resolvedLocalazyProject = localazyProject || await this.loadProject(resolvedLocalazyData.access_token);
    if (!resolvedLocalazyProject) {
      return null;
    }
    const localazySourceLanguage = DirectusLocalazyAdapter.resolveLocalazyLanguageId(resolvedLocalazyProject.sourceLanguage);
    const sourceLanguage: DirectusLocalazyLanguage = {
      originalForm: localazySourceLanguage?.locale || '',
      localazyForm: localazySourceLanguage?.locale || '',
      directusForm: '',
    };

    return this.fetchLocalazyContent({
      ...options,
      languages: [sourceLanguage],
      localazyProject: resolvedLocalazyProject,
      contentTransferSetup: resolvedContentTransferSetup,
      settings: resolvedSettings,
    });
  }

  protected async fetchLocalazyContent(options: FetchLocalazyContent) {
    const {
      schema, languages, ItemsService, localazyProject, settings, contentTransferSetup, localazyData,
    } = options;
    try {
      if (this.missingLocalazyCollections(schema)) {
        return null;
      }

      let resolvedSettings = settings || null;
      let resolvedContentTransferSetup = contentTransferSetup || null;
      let resolvedLocalazyData = localazyData || null;

      if (!resolvedSettings || !resolvedContentTransferSetup) {
        const result = await this.resolveLocalazySettings(ItemsService, schema);
        resolvedSettings = result.settings;
        resolvedContentTransferSetup = result.contentTransferSetup;
      }

      if (!resolvedLocalazyData) {
        const result = await this.resolveLocalazyData(ItemsService, schema);
        resolvedLocalazyData = result.localazyData;
      }

      if (!resolvedSettings || !resolvedContentTransferSetup || !resolvedLocalazyData) {
        return null;
      }

      const resolvedLocalazyProject = localazyProject || await this.loadProject(resolvedLocalazyData.access_token);
      if (!resolvedLocalazyProject) {
        return null;
      }

      const importContent = await importFromLocalazyService.importContentFromLocalazy({
        languages,
        localazyData: resolvedLocalazyData,
        localazyProject: resolvedLocalazyProject,
        enabledFields: EnabledFieldsService.parseFromDatabase(resolvedContentTransferSetup.enabled_fields),
        progressCallbacks: {
          nothingToImport: () => trackLocalazyError(new Error('Nothing to import'), 'fetchLocalazyContent'),
          couldNotFetchContent: (language) => trackLocalazyError(
            new Error(`Couldn't fetch content for ${language}`),
            'fetchLocalazyContent',
          ),
        },
      });

      return {
        importContent,
        settings: resolvedSettings,
        localazyData: resolvedLocalazyData,
        localazyProject: resolvedLocalazyProject,
      };
    } catch (e: any) {
      trackLocalazyError(e, 'fetchLocalazyContent');
      return null;
    }
  }

  protected async deprecateLocalazyKeys(localazyData: LocalazyData, projectId: string, keyIds: string[]) {
    const { add, execute } = useEnhancedAsyncQueue();

    keyIds.forEach((keyId) => {
      add(async () => {
        LocalazyApiThrottleService.updateKey(localazyData.access_token, {
          project: projectId,
          key: keyId,
          deprecated: 0,
        });
      });
    });

    await execute({ delayBetween: 100 });
  }

  protected async resolveExportLanguages(ItemsService: any, settings: Settings) {
    try {
      const synchronizationLanguagesService = new SynchronizationLanguagesService(ItemsService);
      const exportLanguages = await synchronizationLanguagesService.resolveExportLanguages(
        settings,
      );
      return exportLanguages;
    } catch (e: any) {
      trackDirectusError(e, 'resolveExportLanguages');
      return [];
    }
  }

  protected async exportToLocalazy(data: ExportToLocalazy) {
    const {
      schema, settings, content, localazyProject, localazyData,
    } = data;
    if (this.missingLocalazyCollections(schema)) {
      return;
    }

    const exportToLocalazyService = new ExportToLocalazyService();
    await exportToLocalazyService.exportContentToLocalazy({
      content,
      localazyProject,
      localazyData,
      settings,
    });
  }
}
