import { isArray, mergeWith } from 'lodash';

function customizer<T>(objValue: T[], srcValue: T[]): T[] | undefined {
  if (isArray(objValue)) {
    return objValue.concat(srcValue);
  }
  return undefined;
}

export function mergeWithArrays<T extends object>(object: T, source: Partial<T>): T {
  return mergeWith(object, source, customizer);
}
