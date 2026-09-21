import { useEffect, useState } from 'react';
import { consentApi } from '../api/consentApi';
import { isConsentGateShown } from '../screens/auth/ConsentGateScreen';

/** AUTHENTICATED 상태에서만 호출한다 — /consent/policy는 인증이 필요한 엔드포인트다. */
export function useConsentGateNeeded(): boolean | null {
  const [needed, setNeeded] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    consentApi.getPolicy().then(async (policy) => {
      const shown = await isConsentGateShown(policy.policyVersion);
      if (!cancelled) setNeeded(!shown);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return needed;
}
