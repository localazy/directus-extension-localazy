import { onBeforeUnmount, watch, type Ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

export const DEFAULT_UNSAVED_CHANGES_MESSAGE = 'You have unsaved changes. Leave anyway?';

type ConfirmFn = (message: string) => boolean;

export type GuardCallbacks = {
  leaveGuard: () => boolean;
  beforeUnloadHandler: (event: BeforeUnloadEvent) => void;
};

/**
 * Pure factory for the two guard callbacks — kept separate from the Vue composable so
 * unit tests can exercise the logic without spinning up a component instance. `confirm`
 * is injected so the test env can hand in a deterministic stub instead of depending on
 * `window.confirm`.
 *
 *  - `leaveGuard()` returns true when navigation should proceed, false to block.
 *  - `beforeUnloadHandler(event)` sets `event.returnValue` when dirty, which is what
 *    triggers the browser's native "Leave site?" prompt on hard refresh / tab close.
 */
export function createUnsavedChangesGuards(isDirty: Ref<boolean>, message: string, confirm: ConfirmFn): GuardCallbacks {
  return {
    leaveGuard: () => {
      if (!isDirty.value) return true;
      return confirm(message);
    },
    beforeUnloadHandler: (event: BeforeUnloadEvent) => {
      if (!isDirty.value) return;
      event.preventDefault();
      // Setting returnValue is the cross-browser way to surface the native prompt; the
      // string itself is ignored by modern browsers but the assignment is what triggers
      // the dialog.
      event.returnValue = message;
    },
  };
}

/**
 * Block accidental navigation away from a page with unsaved form edits. Wires two guards:
 *
 *  - **In-app routes** — `onBeforeRouteLeave` shows a `confirm()` dialog before letting
 *    the user click into a different Directus page.
 *  - **Hard refresh / tab close** — a `beforeunload` listener triggers the browser's
 *    native "Leave site?" prompt.
 *
 * The `beforeunload` listener is registered lazily on the first dirty transition and
 * torn down whenever the page goes clean again or the host component unmounts, so clean
 * pages don't leave dangling listeners pinned to `window`.
 *
 * Safe to call outside a router-aware component: `onBeforeRouteLeave` no-ops if there is
 * no current route, and `beforeunload` no-ops if `window` is undefined (e.g. unit tests
 * in the Node Vitest env).
 */
export function useUnsavedChangesGuard(isDirty: Ref<boolean>, message: string = DEFAULT_UNSAVED_CHANGES_MESSAGE): void {
  const win = typeof window !== 'undefined' ? window : null;
  const { leaveGuard, beforeUnloadHandler } = createUnsavedChangesGuards(isDirty, message, (m) => (win ? win.confirm(m) : true));

  onBeforeRouteLeave(leaveGuard);

  if (!win) return;

  let listenerAttached = false;

  watch(
    isDirty,
    (dirty) => {
      if (dirty && !listenerAttached) {
        win.addEventListener('beforeunload', beforeUnloadHandler);
        listenerAttached = true;
      } else if (!dirty && listenerAttached) {
        win.removeEventListener('beforeunload', beforeUnloadHandler);
        listenerAttached = false;
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (listenerAttached) {
      win.removeEventListener('beforeunload', beforeUnloadHandler);
      listenerAttached = false;
    }
  });
}
