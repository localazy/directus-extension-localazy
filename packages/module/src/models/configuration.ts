import { ContentTransferSetupDatabase } from '@localazy/directus-common';
import { LocalazyData } from '@localazy/directus-common';
import { Settings } from '@localazy/directus-common';
import { SyncState } from '@localazy/directus-common';

export type Configuration = {
  settings: Settings;
  content_transfer_setup: ContentTransferSetupDatabase;
  localazy_data: LocalazyData;
  sync_state: SyncState;
};
