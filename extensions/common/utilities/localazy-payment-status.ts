import { Project } from '@localazy/api-client';

export class LocalazyPaymentStatus {
  static isOverKeysLimit(localazyProject: Project | null) {
    if (localazyProject?.organization) {
      return localazyProject.organization.usedKeys > localazyProject.organization.availableKeys;
    }
    return false;
  }

  static lacksAccessToPlugin(localazyProject: Project| null) {
    if (localazyProject?.organization) {
      return !localazyProject.organization.figma;
    }
    return false;
  }

  static shouldDisableSyncOperations(localazyProject: Project | null) {
    return LocalazyPaymentStatus.isOverKeysLimit(localazyProject) || LocalazyPaymentStatus.lacksAccessToPlugin(localazyProject);
  }
}
