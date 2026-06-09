import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Static-source assertions that the Automation page keeps its dual-section shape
 * (Export above Import, each section's master toggle + sub-settings wired to the
 * correct `Settings` fields). Sibling of AutomationForm.filter.test.ts — same trade-off:
 * static-source matching is cheap and catches the regressions we care about
 * (someone deleting the export master, or rewiring the sub-toggle to the wrong field)
 * without needing to mount the Vue tree with `@directus/extensions-sdk`.
 */
const here = dirname(fileURLToPath(import.meta.url));
const formSource = readFileSync(resolve(here, 'AutomationForm.vue'), 'utf8');

describe('AutomationForm — section structure', () => {
  it('renders an Export header above an Import header', () => {
    const exportIdx = formSource.indexOf('>Export</h2>');
    const importIdx = formSource.indexOf('>Import</h2>');
    expect(exportIdx).toBeGreaterThanOrEqual(0);
    expect(importIdx).toBeGreaterThanOrEqual(0);
    expect(exportIdx).toBeLessThan(importIdx);
  });
});

describe('AutomationForm — Export section wiring', () => {
  it('binds the master toggle to `automated_upload`', () => {
    // <v-select v-model="localEdits.automated_upload" :items="enabledOptions" />
    expect(formSource).toMatch(/v-model="localEdits\.automated_upload"[^>]*:items="enabledOptions"/);
  });

  it('binds the deprecation sub-toggle to `automated_deprecation`', () => {
    expect(formSource).toMatch(/v-model="localEdits\.automated_deprecation"/);
  });

  it('disables the deprecation sub-toggle when the master is off', () => {
    expect(formSource).toMatch(/v-model="localEdits\.automated_deprecation"[\s\S]*?:disabled="!localEdits\.automated_upload"/);
  });

  it('wraps the deprecation sub-toggle in a settings-group gated by `automated_upload`', () => {
    expect(formSource).toMatch(/settings-group[^"]*['"][^>]*\{\s*disabled:\s*!localEdits\.automated_upload\s*\}/);
  });
});

describe('AutomationForm — Import section wiring', () => {
  it('binds the master toggle to `automated_import`', () => {
    expect(formSource).toMatch(/v-model="localEdits\.automated_import"[^>]*:items="enabledOptions"/);
  });

  it('wraps the import sub-settings in a settings-group gated by `automated_import`', () => {
    expect(formSource).toMatch(/settings-group[^"]*['"][^>]*\{\s*disabled:\s*!localEdits\.automated_import\s*\}/);
  });
});
