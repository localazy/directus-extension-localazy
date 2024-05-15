import { getGenericConnectorClient } from '../api/generic-connector-api';
import { getConfig } from '../config/get-config';
import { CreateMissingLanguagesInDirectus } from '../enums/create-missing-languages-in-directus';

type CommonParams = {
  userId: string;
  orgId: string;
};

type LoggedIn = CommonParams & {
  name: string;
};

type ConnectedProject = CommonParams & {
  name: string;
  slug: string;
};

type ErrorEvent = CommonParams & {
  origin: 'Localazy' | 'Directus';
  autoEvent?: boolean;
  type: string;
  message: string;
  errorData: string;
};

type UploadToLocalazy = CommonParams & {
  projectName: string;
  sourceLanguage: string;
  languages: string[];
  upload_existing_translations: 0 | 1;
  automated_upload: 0 | 1;
  automated_deprecation: 0 | 1;
  skip_empty_strings: 0 | 1;
  create_missing_languages_in_directus: CreateMissingLanguagesInDirectus;
};

type DownloadToLocalazy = CommonParams & {
  projectName: string;
  sourceLanguage: string;
  languages: string[];
  upload_existing_translations: 0 | 1;
  automated_upload: 0 | 1;
  automated_deprecation: 0 | 1;
  skip_empty_strings: 0 | 1;
  create_missing_languages_in_directus: CreateMissingLanguagesInDirectus;
};

export class AnalyticsService {
  static trackLoggedIn(params: LoggedIn) {
    const GenericConnectorAPI = getGenericConnectorClient();
    return GenericConnectorAPI.analytics.track({
      event: 'Directus: Logged In To Localazy',
      category: 'User',
      data: {
        ...params,
        is_demo: getConfig().APP_MODE === 'demo',
      },
    });
  }

  static trackLogOut(params: LoggedIn) {
    const GenericConnectorAPI = getGenericConnectorClient();
    return GenericConnectorAPI.analytics.track({
      event: 'Directus: Logged Out From Localazy',
      category: 'User',
      data: {
        ...params,
        is_demo: getConfig().APP_MODE === 'demo',
      },
    });
  }

  static trackConnectedProject(params: ConnectedProject) {
    const GenericConnectorAPI = getGenericConnectorClient();
    return GenericConnectorAPI.analytics.track({
      event: 'Directus: Connected to Localazy',
      category: 'Project',
      data: {
        ...params,
        is_demo: getConfig().APP_MODE === 'demo',
      },
    });
  }

  static trackError(params: ErrorEvent) {
    const GenericConnectorAPI = getGenericConnectorClient();
    return GenericConnectorAPI.analytics.track({
      event: 'Directus: Error occured',
      category: 'Project',
      data: {
        ...params,
        autoEvent: params.autoEvent || false,
        is_demo: getConfig().APP_MODE === 'demo',
      },
    });
  }

  static trackUploadToLocalazy(params: UploadToLocalazy) {
    const GenericConnectorAPI = getGenericConnectorClient();
    return GenericConnectorAPI.analytics.track({
      event: 'Directus: Upload to Localazy',
      category: 'Project',
      data: {
        ...params,
        is_demo: getConfig().APP_MODE === 'demo',
      },
    });
  }

  static trackDownloadFromLocalazy(params: DownloadToLocalazy) {
    const GenericConnectorAPI = getGenericConnectorClient();
    return GenericConnectorAPI.analytics.track({
      event: 'Directus: Download From Localazy',
      category: 'Project',
      data: {
        ...params,
        is_demo: getConfig().APP_MODE === 'demo',
      },
    });
  }
}
