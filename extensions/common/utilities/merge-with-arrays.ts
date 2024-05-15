import { isArray, mergeWith } from 'lodash';

function customizer(objValue: any[], srcValue: any[]) {
  if (isArray(objValue)) {
    return objValue.concat(srcValue);
  }
  return undefined;
}

export function mergeWithArrays(object: any, source: any) {
  return mergeWith(object, source, customizer);
}
