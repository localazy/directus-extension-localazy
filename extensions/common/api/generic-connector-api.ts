import { GenericConnectorClient, Services } from '@localazy/generic-connector-client';
import { getConfig } from '../config/get-config';

export const getGenericConnectorClient = () => new GenericConnectorClient({
  pluginId: Services.DIRECTUS,
  genericConnectorUrl: getConfig().LOCALAZY_PLUGIN_CONNECTOR_API_URL,
});
