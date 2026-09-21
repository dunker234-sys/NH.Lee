import { ConsentPolicyView, ConsentStatusView } from '@attendance/shared-types';
import { apiFetch } from './client';

const TYPE = 'LOCATION_COLLECTION' as const;

export const consentApi = {
  getPolicy(): Promise<ConsentPolicyView> {
    return apiFetch('/consent/policy', { query: { type: TYPE } });
  },

  getStatus(): Promise<ConsentStatusView> {
    return apiFetch('/consent', { query: { type: TYPE } });
  },

  /** 최초 동의(ConsentGateScreen) 또는 일시중지 후 재개(PrivacyScreen)에 쓴다. */
  agree(): Promise<ConsentStatusView['current']> {
    return apiFetch('/consent', { method: 'POST', body: { consentType: TYPE } });
  },

  pause(): Promise<ConsentStatusView['current']> {
    return apiFetch('/consent/location/pause', { method: 'POST' });
  },

  withdraw(): Promise<ConsentStatusView['current']> {
    return apiFetch('/consent/location/withdraw', { method: 'POST' });
  },
};
