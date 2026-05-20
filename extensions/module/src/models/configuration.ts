import { ContentTransferSetupDatabase } from '../../../common/models/collections-data/content-transfer-setup';
import { LocalazyData } from '../../../common/models/collections-data/localazy-data';
import { Settings } from '../../../common/models/collections-data/settings';
import { SyncState } from '../../../common/models/collections-data/sync-state';

export type Configuration = {
  settings: Settings;
  content_transfer_setup: ContentTransferSetupDatabase;
  localazy_data: LocalazyData;
  sync_state: SyncState;
};
