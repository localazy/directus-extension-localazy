import { KeyValueEntry } from '../models/localazy-key-entry';
import { DirectusLocalazyAdapter } from './directus-localazy-adapter';
import { LocalazyApiThrottleService } from './localazy-api-throttle-service';
import { Settings } from '../models/collections-data/settings';

type GetDirectusSourceLanguageAsLocalazyLanguage = {
  localazySourceLanguage: number;
  directusSourceLanguage: string;
};

type TrackUploadToLocalazy = {
  userId: string;
  localazyProject: string;
  orgId: string;
  settings: Settings;
  languages: string[];
};

export class ExportToLocalazyCommonService {
  static async exportToLocalazy(token: string, projectId: string, content: KeyValueEntry, language: string) {
    return LocalazyApiThrottleService.import(token, {
      project: projectId,
      i18nOptions: {
        deprecate: 'none',
      },
      fileOptions: {
        name: 'directus.json',
      },
      contentOptions: {
        type: 'json',
      },
      json: {
        [language]: content,
      },
    });
  }

  static getDirectusSourceLanguageAsLocalazyLanguage(data: GetDirectusSourceLanguageAsLocalazyLanguage) {
    return DirectusLocalazyAdapter
      .mapDirectusToLocalazySourceLanguage(data.localazySourceLanguage, data.directusSourceLanguage);
  }

  static getPayloadForUploadAnalytics(payload: TrackUploadToLocalazy) {
    const {
      localazyProject, settings, languages, orgId,
    } = payload;
    return {
      orgId,
      userId: payload.userId,
      projectName: localazyProject,
      sourceLanguage: settings.source_language,
      upload_existing_translations: settings.upload_existing_translations,
      skip_empty_strings: settings.skip_empty_strings,
      automated_upload: settings.automated_upload,
      automated_deprecation: settings.automated_deprecation,
      create_missing_languages_in_directus: settings.create_missing_languages_in_directus,
      languages,
    };
  }
}
