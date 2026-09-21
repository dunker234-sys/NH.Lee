import { SiteSummary } from '@attendance/shared-types';
import { apiFetch } from './client';

export const sitesApi = {
  listMine(): Promise<{ items: SiteSummary[] }> {
    return apiFetch('/sites');
  },

  getById(id: string): Promise<SiteSummary> {
    return apiFetch(`/sites/${id}`);
  },
};
