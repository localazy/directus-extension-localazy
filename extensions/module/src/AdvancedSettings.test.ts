import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Lightweight static-source assertions for the AdvancedSettings page's operator-tools
 * polish (PR G). Mounting the whole `<private-view>` in Vue would need
 * `@directus/extensions-sdk` plus the full Pinia / router context, which isn't worth the
 * harness cost for these UI-shape invariants. Reading the source is enough to catch the
 * regressions we care about: someone trimming the confirm-dialog wording back to a brief
 * sentence, dropping the lock-state details block, removing the loading-state on the
 * button, or losing the `'success'` toast type.
 */
const here = dirname(fileURLToPath(import.meta.url));
const componentSource = readFileSync(resolve(here, 'AdvancedSettings.vue'), 'utf8');

describe('AdvancedSettings — operator-tools polish', () => {
  it('expanded confirm-dialog body explains the consequences', () => {
    // Normalise whitespace so soft-wrap inside the SFC doesn't trip the substring match.
    const normalised = componentSource.replace(/\s+/g, ' ');
    expect(normalised).toContain('Clearing the lock will let the next sync proceed.');
    expect(normalised).toContain('Any in-flight work');
    expect(normalised).toContain('partially-imported translations stay in place');
    expect(normalised).toContain('stuck for more than 5 minutes');
  });

  it('renders a read-only lock-state details block (initiator / started / heartbeat)', () => {
    // The block carries a stable testid so future tests / a Vue mount could target it.
    expect(componentSource).toContain('data-testid="lock-state-details"');
    expect(componentSource).toContain('Initiator');
    expect(componentSource).toContain('Started at');
    expect(componentSource).toContain('Last heartbeat');
  });

  it('disables the trigger button and the confirm button while clearing', () => {
    // Both the trigger button and the in-dialog confirm button must surface :disabled +
    // :loading bound to the clearing ref. Match on the line containing the button's
    // visible label and assert both :disabled and :loading are present on that line.
    const triggerLine = componentSource.split('\n').find((l) => l.includes('Clear stuck sync')) ?? '';
    expect(triggerLine).toContain(':disabled="clearing"');
    expect(triggerLine).toContain(':loading="clearing"');
    const confirmLine = componentSource.split('\n').find((l) => l.includes('Clear lock')) ?? '';
    expect(confirmLine).toContain(':disabled="clearing"');
    expect(confirmLine).toContain(':loading="clearing"');
  });

  it("passes type: 'success' to notificationsStore.add() after clearing", () => {
    expect(componentSource).toMatch(/notificationsStore\.add\(\s*\{\s*title:\s*'Sync lock cleared'[^}]*type:\s*'success'/);
  });

  it('formats the lock initiator using "webhook" → "Webhook" for the details block', () => {
    expect(componentSource).toContain("if (initiator === 'webhook') return 'Webhook'");
  });
});
