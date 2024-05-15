import { UseAsyncQueueResult, useAsyncQueue } from '@vueuse/core';
import {
  Ref,
  computed,
  nextTick, ref, unref, watchEffect,
} from 'vue';

type QueuedPromise<T> = () => Promise<T>;

/** Extension of useAsyncQueue
 * - adding promises to the queue is easier
 * - execute the queue with a delay between each promise
 * - get the result of the queue without accessing the queue object with index
 * - isFinished exists
 */
export const useEnhancedAsyncQueue = () => {
  const queuedPromises = ref<QueuedPromise<any>[]>([]);
  const activeIndex = ref(0);
  const result: Ref<any> = ref(null);
  // const isFinished = ref(false);
  const queue: ReturnType<typeof useAsyncQueue> = {
    activeIndex,
    result: unref(result),
  };

  const isFinished = computed(() => activeIndex.value + 1 === queuedPromises.value.length
  && result.value.every((r: any) => r.state !== 'pending'));

  function add<T>(promise: QueuedPromise<T> | QueuedPromise<T>[]) {
    queuedPromises.value = queuedPromises.value.concat(promise);
  }

  async function execute<T>(options: Partial<{delayBetween: number}> = {}): Promise<UseAsyncQueueResult<T>[]> {
    // isFinished.value = false;
    return new Promise((resolve) => {
      let promises = queuedPromises.value;
      if (options.delayBetween) {
        promises = queuedPromises.value.map((promise) => async () => {
          const promiseResult = await promise();
          await new Promise((r) => { setTimeout(r, options.delayBetween); });
          return promiseResult;
        });
      }

      const currentQueue = useAsyncQueue(promises);

      const stopWatch = watchEffect(() => {
        activeIndex.value = currentQueue.activeIndex.value;
        queue.result = currentQueue.result;
        result.value = currentQueue.result;
        nextTick(() => {
          if (isFinished.value) {
            queuedPromises.value = [];
            activeIndex.value = 0;
            stopWatch();
            resolve(result.value);
          }
        });
      });
    });
  }

  return {
    add,
    execute,
    result,
    activeIndex,
    isFinished,
  };
};
