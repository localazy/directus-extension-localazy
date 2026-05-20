export enum ProgressTrackerId {
  PREPARING_EXPORT,
  RETRIEVING_LANGUAGES,
  IMPORT_FINISHED,
  FETCHING_CONTENT_FROM_LOCALAZY,
  EXPORT_FINISHED,
  LOADED_LOCALAZY_PROJECT,
  IMPORTED_CONTENT_CHUNK,
  UPDATING_DIRECTUS_COLLECTION,
  // Incremental download sync progress markers — keep IDs stable; the progress modal
  // de-dupes by id so reusing one updates the existing line in place.
  SYNC_MODE_HEADER,
  FETCHING_TRANSLATIONS,
  CHANGES_SUMMARY,
  UPDATING_TRANSLATION_STRINGS,
  UP_TO_DATE,

  NOTHING_TO_IMPORT,
  NOT_CONNECTED_TO_LOCALAZY,
  UPDATING_DIRECTUS_COLLECTION_ERROR,

  // Incremental upload sync progress markers — same de-dupe-by-id contract as the
  // download markers above. UPLOAD_MODE_HEADER mirrors SYNC_MODE_HEADER but for the
  // export flow; UPLOAD_CHANGES_SUMMARY mirrors CHANGES_SUMMARY; UPLOAD_UP_TO_DATE is
  // the "nothing changed" short-circuit message.
  UPLOAD_MODE_HEADER,
  UPLOAD_CHANGES_SUMMARY,
  UPLOAD_UP_TO_DATE,
  UPLOAD_FINISHED,
}
