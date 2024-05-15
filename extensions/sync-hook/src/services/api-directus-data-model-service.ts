import { Field, Relation, SchemaOverview } from '@directus/types';
import { DirectusDataModel } from '../../../common/interfaces/directus-data-model';
import { FieldsUtilsService } from '../../../common/utilities/fields-utils-service';

export class ApiDirectusDataModelService implements DirectusDataModel {
  private FieldsService!: any;

  private schema!: SchemaOverview;

  constructor(schema: SchemaOverview, FieldsService: any) {
    this.FieldsService = FieldsService;
    this.schema = schema;
  }

  async getFieldsForCollection(collection: string) {
    const fields: Field[] = await (new this.FieldsService({ schema: this.schema })).readAll(collection);
    return fields;
  }

  /** Copied from Directus internals */
  getRelationsForField(collection: string, field: string): Relation[] {
    const allRelations = this.schema.relations;

    const relationsForField: Relation[] = this.getRelationsForCollection(collection).filter((relation: Relation) => (
      (relation.collection === collection && relation.field === field)
        || (relation.related_collection === collection && relation.meta?.one_field === field)
    ));

    if (relationsForField.length > 0) {
      const firstRelationForField = relationsForField[0];
      const isM2M = firstRelationForField?.meta?.junction_field !== null;

      // If the relation matching the field has a junction field, it's a m2m. In that case,
      // we also want to return the secondary relationship (from the jt to the related)
      // so any ui elements (interfaces) can utilize the full relationship
      if (isM2M) {
        const secondaryRelation = allRelations.find((relation) => (
          relation.collection === firstRelationForField?.collection && relation.field === firstRelationForField?.meta?.junction_field
        ));

        if (secondaryRelation) relationsForField.push(secondaryRelation);
      }
    }

    return relationsForField;
  }

  private getRelationsForCollection(collection: string) {
    return this.schema.relations.filter((relation) => relation.collection === collection || relation.related_collection === collection);
  }

  async getTranslationTypeFields(translatableCollection: string) {
    const fields = await this.getFieldsForCollection(translatableCollection);
    return fields.filter(FieldsUtilsService.isTranslationField);
  }
}
