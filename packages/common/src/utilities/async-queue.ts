type QueuedTask<T> = () => Promise<T>;

export type AsyncQueueTaskState = 'pending' | 'fulfilled' | 'rejected';

export type AsyncQueueResult<T> = {
  state: AsyncQueueTaskState;
  data: T | null;
};

export type AsyncQueueOptions = {
  /** Milliseconds to wait between consecutive tasks. Useful for client-side rate limiting. */
  delayBetween?: number;
};

/**
 * Plain-Promise async queue.
 *
 * Runs queued tasks sequentially with an optional delay between them. Failed tasks
 * are captured in the result with state: 'rejected' and don't abort the queue, so
 * one bad task doesn't take the rest down with it.
 *
 * Replaces an earlier Vue-reactive composable variant. The hook never needed
 * reactivity — the runtime cost (Vue's ref / computed / watchEffect, ~25KB
 * minified in the hook bundle) was a leftover from when the implementation was
 * shared between the admin module and the hook.
 */
export const createAsyncQueue = () => {
  const tasks: QueuedTask<unknown>[] = [];

  function add<T>(task: QueuedTask<T> | QueuedTask<T>[]) {
    if (Array.isArray(task)) {
      tasks.push(...(task as QueuedTask<unknown>[]));
    } else {
      tasks.push(task as QueuedTask<unknown>);
    }
  }

  async function execute<T>(options: AsyncQueueOptions = {}): Promise<AsyncQueueResult<T>[]> {
    const results: AsyncQueueResult<T>[] = [];
    const { delayBetween } = options;

    for (let i = 0; i < tasks.length; i += 1) {
      const fn = tasks[i] as QueuedTask<T>;
      try {
        const data = await fn();
        results.push({ state: 'fulfilled', data });
      } catch {
        results.push({ state: 'rejected', data: null });
      }

      if (delayBetween && i < tasks.length - 1) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayBetween);
        });
      }
    }

    return results;
  }

  return { add, execute };
};
