/**
 * Type definitions for Directus internal services.
 *
 * These types represent the shape of Directus services used in hooks and extensions.
 * They provide type safety when interacting with Directus's internal APIs that aren't
 * exposed through their public type definitions.
 *
 * @module DirectusServices
 * @see {@link https://docs.directus.io/extensions/hooks.html} Directus Hooks Documentation
 */

import { Query, Item, SchemaOverview, Field } from '@directus/types';

/**
 * Options for creating Directus service instances.
 */
export interface DirectusServiceOptions {
  schema: SchemaOverview;
  accountability?: {
    user?: string;
    role?: string;
    admin?: boolean;
    app?: boolean;
  };
  knex?: unknown;
}

/**
 * Directus Items Service interface.
 * Represents a service instance for a specific collection.
 */
export interface DirectusItemsServiceInstance {
  readByQuery(query: Query): Promise<Item[]>;
  readOne(key: string | number, query?: Query): Promise<Item>;
  readMany(keys: (string | number)[], query?: Query): Promise<Item[]>;
  createOne(data: Partial<Item>): Promise<string | number>;
  createMany(data: Partial<Item>[]): Promise<(string | number)[]>;
  updateOne(key: string | number, data: Partial<Item>): Promise<string | number>;
  updateMany(keys: (string | number)[], data: Partial<Item>): Promise<(string | number)[]>;
  updateByQuery(query: Query, data: Partial<Item>): Promise<(string | number)[]>;
  deleteOne(key: string | number): Promise<string | number>;
  deleteMany(keys: (string | number)[]): Promise<(string | number)[]>;
  deleteByQuery(query: Query): Promise<(string | number)[]>;
  upsertOne(data: Partial<Item>): Promise<string | number>;
  upsertMany(data: Partial<Item>[]): Promise<(string | number)[]>;
  upsertSingleton(data: Partial<Item>): Promise<string | number>;
}

/**
 * Constructor type for Directus Items Service.
 */
export interface DirectusItemsServiceConstructor {
  new (collection: string, options: DirectusServiceOptions): DirectusItemsServiceInstance;
}

/**
 * Directus Fields Service interface.
 * Represents a service for managing collection fields.
 */
export interface DirectusFieldsServiceInstance {
  readAll(collection?: string): Promise<Field[]>;
  readOne(collection: string, field: string): Promise<Field>;
  createField(collection: string, field: Partial<Field>): Promise<Field>;
  updateField(collection: string, field: string, data: Partial<Field>): Promise<Field>;
  deleteField(collection: string, field: string): Promise<void>;
}

/**
 * Constructor type for Directus Fields Service.
 */
export interface DirectusFieldsServiceConstructor {
  new (options: DirectusServiceOptions): DirectusFieldsServiceInstance;
}

/**
 * Directus Logger interface.
 * Represents the logging service available in hooks.
 */
export interface DirectusLogger {
  fatal(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  child(options: Record<string, unknown>): DirectusLogger;
}

/**
 * Directus Hook Context.
 * Represents the context object passed to hook handlers.
 */
export interface DirectusHookContext {
  database: unknown;
  schema: SchemaOverview;
  accountability?: {
    user?: string;
    role?: string;
    admin?: boolean;
    app?: boolean;
  };
}

/**
 * Generic record type for translation items and similar data.
 */
export type TranslationRecord = Record<string, string | number | boolean | null | undefined>;

/**
 * Generic record type for metadata and flexible objects.
 */
export type FlexibleRecord = Record<string, unknown>;

/**
 * Error with optional message property.
 */
export interface ErrorWithMessage {
  message?: string;
  code?: string;
  status?: number;
}
