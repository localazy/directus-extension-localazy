import { ref, watch, computed, type ComputedRef, type Ref } from 'vue';
import { cloneDeep, isEqual } from 'lodash';

/**
 * Minimal contract a `useLocalazySingleton`-style store must satisfy to be edited via
 * this composable. We accept the Pinia store directly; reactive access (`store.data`,
 * `store.loading`) is automatic inside watch / computed.
 */
type EditableSingleton<T> = {
  data: T;
  loading: boolean;
  save: (payload: Partial<T>) => Promise<void>;
};

type SingletonForm<T> = {
  /** Mutable working copy bound to the form template. */
  edits: Ref<T>;
  /** True whenever the working copy differs from the persisted data. */
  changesExist: ComputedRef<boolean>;
  /** Persist the working copy. Returns when the store reload finishes. */
  save: () => Promise<void>;
  /** True while the underlying store is talking to Directus. */
  loading: ComputedRef<boolean>;
};

/**
 * Forms for `useLocalazySingleton`-style records — `AdvancedSettings.vue`,
 * `ProjectSetup.vue`, and any future singleton edits — all share the same shape:
 *   1. clone the persisted record into a working copy
 *   2. compare to detect dirty
 *   3. on save, push the working copy through `store.save`
 *   4. when the store reload returns the new persisted value, reseat the working copy
 *      so `changesExist` flips back to false
 *
 * This composable owns that contract so the views don't each reimplement it. Notification
 * on success stays at the call site — the text varies per page and isn't a form concern.
 *
 * Usage:
 * ```ts
 * const settingsStore = useLocalazySettingsStore();
 * const { edits, changesExist, save, loading } = useSingletonForm(settingsStore);
 * ```
 */
export function useSingletonForm<T extends Record<string, unknown>>(store: EditableSingleton<T>): SingletonForm<T> {
  const edits = ref<T>(cloneDeep(store.data)) as Ref<T>;

  // Reseat the working copy whenever the persisted data changes — initial load,
  // post-save reload, or a rare cross-tab edit. The `deep: true` is important because
  // store.data is a plain object; without it Vue compares by reference and misses any
  // change inside the object.
  watch(
    () => store.data,
    (next) => {
      edits.value = cloneDeep(next);
    },
    { immediate: true, deep: true },
  );

  const changesExist = computed(() => !isEqual(edits.value, store.data));
  const loading = computed(() => store.loading);

  async function save(): Promise<void> {
    await store.save(edits.value);
  }

  return { edits, changesExist, save, loading };
}
