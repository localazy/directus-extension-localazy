/**
 * One `(collection, itemId, hash)` triple successfully uploaded to Localazy during an
 * upload sync. The orchestrator collects these from `useExportToLocalazy` after all
 * containing chunks resolve successfully, then advances the in-memory upload cursor.
 *
 * Per-item-after-all-chunks-succeed semantics: if a single item's content lands in
 * multiple chunks (across languages, or across collection-split boundaries on huge
 * installs), every one of those chunks must succeed before we mark the item as uploaded.
 * A partial upload — where some languages landed but others failed — must NOT advance
 * the cursor, otherwise the next sync would skip the failed languages.
 */
export type UploadedTriple = {
  collection: string;
  itemId: string;
  hash: string;
};
