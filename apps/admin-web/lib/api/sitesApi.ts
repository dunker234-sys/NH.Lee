import type { SiteSummary } from '@attendance/shared-types';
import { apiFetch } from '../apiClient';

/** 기존(STEP5-A) GET /sites를 재사용한다. */
export const sitesApi = {
  listMine(): Promise<{ items: SiteSummary[] }> {
    return apiFetch('/sites');
  },
};
