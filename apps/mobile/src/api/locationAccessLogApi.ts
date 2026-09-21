import { CursorPage, LocationAccessLogEntry } from '@attendance/shared-types';
import { apiFetch } from './client';

export const locationAccessLogApi = {
  list(params?: { before?: string; limit?: number }): Promise<CursorPage<LocationAccessLogEntry>> {
    return apiFetch('/location-access-log', { query: params });
  },
};
