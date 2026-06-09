const NAME_FIELD_CANDIDATES = ['name', 'english_name', 'label', 'language', 'title'] as const;

export function pickLanguageName(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  for (const field of NAME_FIELD_CANDIDATES) {
    const value = row[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

export function formatLanguageOption(code: string, name: string | null | undefined): string {
  if (name && name !== code) {
    return `${name} (${code})`;
  }
  return code;
}
