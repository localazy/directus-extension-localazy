import { defineStore } from 'pinia';
import { ref } from 'vue';
import { ProgressTracker, ProgressTrackerMessage } from '../models/progress-tracker';
import { ProgressTrackerId } from '../enums/progress-tracker-id';

export const useProgressTrackerStore = defineStore('progress-tracker-store', () => {
  const progressTracker = ref<ProgressTracker>([]);

  function addProgressMessage(message: ProgressTrackerMessage) {
    progressTracker.value.push(message);
  }

  function removeProgressMessage(id: ProgressTrackerId) {
    progressTracker.value = progressTracker.value.filter((message) => message.id !== id);
  }

  function upsertProgressMessage(id: ProgressTrackerId, message: Omit<ProgressTrackerMessage, 'id'>) {
    const messageIndex = progressTracker.value.findIndex((m) => m.id === id);

    if (progressTracker.value[messageIndex] !== undefined) {
      progressTracker.value = [
        ...progressTracker.value.slice(0, messageIndex),
        {
          ...progressTracker.value[messageIndex],
          ...message,
        } as ProgressTrackerMessage,
        ...progressTracker.value.slice(messageIndex + 1),
      ];
    } else {
      addProgressMessage({
        id,
        ...message,
      });
    }
  }

  function resetProgressTracker() {
    progressTracker.value = [];
  }

  return {
    progressTracker,
    addProgressMessage,
    removeProgressMessage,
    upsertProgressMessage,
    resetProgressTracker,
  };
});
