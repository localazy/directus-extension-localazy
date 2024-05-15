/* eslint-disable arrow-body-style */
import { SchemaOverview } from '@directus/types';

export const useGetCollectionFromSchema = (schema: SchemaOverview) => {
  function getCollection(collectionName: string) {
    return schema.collections[collectionName] || null;
  }

  return {
    getCollection,
  };
};
