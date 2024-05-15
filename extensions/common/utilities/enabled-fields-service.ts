import { EnabledField } from '../models/collections-data/content-transfer-setup';

export class EnabledFieldsService {
  static parseFromDatabase(enabledFields: string): EnabledField[] {
    try {
      return JSON.parse(enabledFields);
    } catch (e) {
      return [];
    }
  }

  static prepareForDatabase(enabledFields: EnabledField[]): string {
    if (Array.isArray(enabledFields) === false) {
      return JSON.stringify([]);
    }
    return JSON.stringify(enabledFields);
  }
}
