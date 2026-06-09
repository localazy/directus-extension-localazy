import type { ApiExtensionContext, ExtensionsServices } from '@directus/types';

/**
 * Constructor type for Directus' ItemsService, as provided to extensions via
 * the hook's `services` context. Generic in the row type to mirror the SDK.
 */
export type ItemsServiceCtor = ExtensionsServices['ItemsService'];

/**
 * Constructor type for Directus' FieldsService.
 */
export type FieldsServiceCtor = ExtensionsServices['FieldsService'];

/**
 * The Pino-flavoured logger Directus injects into hook context.
 * Extracted from ApiExtensionContext so consumers don't need a direct
 * dependency on `pino`.
 */
export type DirectusLogger = ApiExtensionContext['logger'];
