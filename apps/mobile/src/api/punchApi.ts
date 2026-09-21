import { BulkPunchItemResult, CreatePunchInput, CreatePunchResult } from '@attendance/shared-types';
import { apiFetch } from './client';

export const punchApi = {
  create(input: CreatePunchInput): Promise<CreatePunchResult> {
    return apiFetch('/punches', { method: 'POST', body: input });
  },

  createBulk(items: CreatePunchInput[], lastKnownServerSyncTime: string): Promise<{ results: BulkPunchItemResult[] }> {
    return apiFetch('/punches/bulk', { method: 'POST', body: { items, lastKnownServerSyncTime } });
  },
};
