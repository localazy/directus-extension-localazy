import { ProgressTrackerId } from '../enums/progress-tracker-id';

export type ProgressTrackerMessage = {
  id: ProgressTrackerId;
  type?: 'pending' | 'success' | 'error';
  message: string;
};

export type ProgressTracker = ProgressTrackerMessage[];
