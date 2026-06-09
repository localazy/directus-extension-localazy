import { describe, it, expect, vi } from 'vitest';
import { reactive, nextTick } from 'vue';
import { useSingletonForm } from './use-singleton-form';

type FakeData = { a: string; b: number };

function makeStore(initial: FakeData) {
  const save = vi.fn(async (payload: Partial<FakeData>) => {
    // Mimic the real factory: save merges into the persisted data and the data updates
    // reactively. This is what triggers the form composable to reseat its edits.
    Object.assign(store.data, payload);
  });
  const store = reactive({
    data: initial,
    loading: false,
    save,
  });
  return store;
}

describe('useSingletonForm', () => {
  it('seeds edits from the persisted data without sharing the reference', () => {
    const store = makeStore({ a: 'hello', b: 1 });
    const { edits } = useSingletonForm(store);

    expect(edits.value).toEqual({ a: 'hello', b: 1 });
    // Mutating edits must not bleed into the store
    edits.value.a = 'edited';
    expect(store.data.a).toBe('hello');
  });

  it('changesExist tracks divergence between edits and the persisted data', async () => {
    const store = makeStore({ a: 'hello', b: 1 });
    const { edits, changesExist } = useSingletonForm(store);

    expect(changesExist.value).toBe(false);

    edits.value.a = 'changed';
    await nextTick();
    expect(changesExist.value).toBe(true);

    edits.value.a = 'hello';
    await nextTick();
    expect(changesExist.value).toBe(false);
  });

  it('save pushes the edits through the store', async () => {
    const store = makeStore({ a: 'hello', b: 1 });
    const { edits, save } = useSingletonForm(store);

    edits.value.a = 'changed';
    edits.value.b = 42;
    await save();

    expect(store.save).toHaveBeenCalledOnce();
    expect(store.save).toHaveBeenCalledWith({ a: 'changed', b: 42 });
  });

  it('reseats edits when the persisted data changes (e.g. after a reload)', async () => {
    const store = makeStore({ a: 'hello', b: 1 });
    const { edits, changesExist } = useSingletonForm(store);

    edits.value.a = 'changed';
    await nextTick();
    expect(changesExist.value).toBe(true);

    // External update — installer finishes, save reloads, cross-tab edit, etc.
    store.data = { a: 'external', b: 99 };
    await nextTick();

    expect(edits.value).toEqual({ a: 'external', b: 99 });
    expect(changesExist.value).toBe(false);
  });

  it('proxies the store loading flag', async () => {
    const store = makeStore({ a: 'hello', b: 1 });
    const { loading } = useSingletonForm(store);

    expect(loading.value).toBe(false);
    store.loading = true;
    await nextTick();
    expect(loading.value).toBe(true);
  });
});
