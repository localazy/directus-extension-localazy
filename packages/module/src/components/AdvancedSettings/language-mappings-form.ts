import { LanguageMappings } from '@localazy/directus-common';

export type MappingCodes = { directusCode: string; localazyCode: string };

export type MappingFieldKey = 'directusCode' | 'localazyCode';

export type MappingErrors = Record<MappingFieldKey, string | null>;

/**
 * Parse the persisted JSON payload into the row codes used by the editor. Tolerates
 * malformed input — an empty list keeps the UI usable rather than throwing on a one-off
 * bad value (the user can still add or replace rows and re-save).
 */
export function parseLanguageMappings(json: string | null | undefined): MappingCodes[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as LanguageMappings;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m): m is { directusCode: string; localazyCode: string } => {
        return !!m && typeof m.directusCode === 'string' && typeof m.localazyCode === 'string';
      })
      .map((m) => ({ directusCode: m.directusCode, localazyCode: m.localazyCode }));
  } catch {
    return [];
  }
}

/**
 * Serialize rows to the JSON payload stored on `Settings.language_mappings`. Rows with
 * either code blank are treated as drafts and excluded — the always-editable UI emits
 * directly from the row state, so half-finished rows must not bleed into the saved value.
 */
export function serializeLanguageMappings(rows: MappingCodes[]): string {
  const filtered = rows.filter((r) => r.directusCode !== '' && r.localazyCode !== '');
  return JSON.stringify(filtered);
}

/**
 * Validate a single row against the rest of the rows. Returns null when the field is OK,
 * an error message otherwise. Empty values are allowed at the row level (they mark the
 * row as a draft) but reported as missing so the row can flag the field visually; the
 * top-level "Save changes" gate is what stops empty rows from being persisted.
 */
export function validateMappingRow(row: MappingCodes, allRows: MappingCodes[], rowIndex: number): MappingErrors {
  return {
    directusCode: fieldError(row, 'directusCode', allRows, rowIndex),
    localazyCode: fieldError(row, 'localazyCode', allRows, rowIndex),
  };
}

function fieldError(row: MappingCodes, field: MappingFieldKey, allRows: MappingCodes[], rowIndex: number): string | null {
  const value = row[field];
  if (value === '' || value === null) {
    return field === 'directusCode' ? 'Select a Directus language' : 'Select a Localazy locale';
  }
  const duplicate = allRows.some((other, idx) => idx !== rowIndex && other[field] === value);
  if (duplicate) {
    const label = field === 'directusCode' ? 'Directus' : 'Localazy';
    return `Duplicate ${label} code "${value}"`;
  }
  return null;
}

/**
 * True when at least one row has any field error. The top-level "Save changes" button
 * uses this to gate persistence — drafts (blank codes) are also reported as errors so
 * the dirty-but-incomplete state can't accidentally save.
 */
export function hasMappingErrors(rows: MappingCodes[]): boolean {
  return rows.some((row, idx) => {
    const errors = validateMappingRow(row, rows, idx);
    return errors.directusCode !== null || errors.localazyCode !== null;
  });
}
