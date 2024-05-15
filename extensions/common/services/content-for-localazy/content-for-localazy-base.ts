import { chunk } from 'lodash';
import { KeyValueEntry } from '../../models/localazy-key-entry';

export class ContentForLocalazyBase {
  protected static META_IDENTIFIER = '@meta:';

  static splitContentIntoChunks(content: KeyValueEntry) {
    const CHUNK_LIMIT = 1000;

    const nonMetaKeys = Object.keys(content).filter((key) => !key.startsWith(ContentForLocalazyBase.META_IDENTIFIER));
    const chunks = chunk(nonMetaKeys, CHUNK_LIMIT);

    return chunks.map((chunkKeys) => {
      const strings: KeyValueEntry = {};
      chunkKeys.forEach((key) => {
        strings[key] = content[key]!;
        const metaKey = `${ContentForLocalazyBase.META_IDENTIFIER}:${key}`;
        if (content[metaKey]) {
          strings[metaKey] = content[metaKey]!;
        }
      });
      return strings;
    });
  }
}
