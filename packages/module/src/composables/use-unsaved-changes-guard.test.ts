import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { createUnsavedChangesGuards } from './use-unsaved-changes-guard';

describe('createUnsavedChangesGuards — leaveGuard', () => {
  it('lets clean navigation through without prompting', () => {
    const confirm = vi.fn(() => true);
    const isDirty = ref(false);
    const { leaveGuard } = createUnsavedChangesGuards(isDirty, 'msg', confirm);
    expect(leaveGuard()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks the user to confirm when the form is dirty', () => {
    const confirm = vi.fn(() => true);
    const isDirty = ref(true);
    const { leaveGuard } = createUnsavedChangesGuards(isDirty, 'msg', confirm);
    expect(leaveGuard()).toBe(true);
    expect(confirm).toHaveBeenCalledWith('msg');
  });

  it('blocks navigation when the user cancels the confirm', () => {
    const confirm = vi.fn(() => false);
    const isDirty = ref(true);
    const { leaveGuard } = createUnsavedChangesGuards(isDirty, 'msg', confirm);
    expect(leaveGuard()).toBe(false);
  });

  it('reacts to dirty-state flips between calls', () => {
    const confirm = vi.fn(() => true);
    const isDirty = ref(false);
    const { leaveGuard } = createUnsavedChangesGuards(isDirty, 'msg', confirm);
    expect(leaveGuard()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    isDirty.value = true;
    expect(leaveGuard()).toBe(true);
    expect(confirm).toHaveBeenCalledOnce();
  });
});

describe('createUnsavedChangesGuards — beforeUnloadHandler', () => {
  function makeEvent() {
    return {
      preventDefault: vi.fn(),
      returnValue: '',
    } as unknown as BeforeUnloadEvent;
  }

  it('is a no-op on a clean form (no native prompt)', () => {
    const isDirty = ref(false);
    const { beforeUnloadHandler } = createUnsavedChangesGuards(isDirty, 'msg', () => true);
    const event = makeEvent();
    beforeUnloadHandler(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBe('');
  });

  it('preventDefaults and sets returnValue when the form is dirty', () => {
    const isDirty = ref(true);
    const { beforeUnloadHandler } = createUnsavedChangesGuards(isDirty, 'msg', () => true);
    const event = makeEvent();
    beforeUnloadHandler(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.returnValue).toBe('msg');
  });
});
