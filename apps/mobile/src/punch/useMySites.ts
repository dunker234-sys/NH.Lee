import { SiteSummary } from '@attendance/shared-types';
import { useEffect, useState } from 'react';
import { sitesApi } from '../api/sitesApi';

export function useMySites(): { sites: SiteSummary[]; loading: boolean } {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    sitesApi
      .listMine()
      .then((res) => {
        if (!cancelled) setSites(res.items);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { sites, loading };
}
