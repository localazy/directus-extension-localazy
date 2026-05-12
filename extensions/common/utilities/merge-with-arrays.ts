import { isArray, mergeWith } from 'lodash';

function customizer(objValue: unknown, srcValue: unknown): unknown[] | undefined {
  if (isArray(objValue) && isArray(srcValue)) {
    return objValue.concat(srcValue);
  }
  return undefined;
}

export function mergeWithArrays<T extends object>(object: T, source: object | null | undefined): T {
  return mergeWith(object, source, customizer) as T;
}
