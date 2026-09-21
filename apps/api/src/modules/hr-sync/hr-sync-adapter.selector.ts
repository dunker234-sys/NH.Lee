import { HrSourceAdapter, HrSyncAdapterType } from './hr-sync.types';

export interface HrSourceAdapters {
  file: HrSourceAdapter;
  db: HrSourceAdapter;
  api: HrSourceAdapter;
}

/**
 * HR_SYNC_ADAPTER_TYPE 설정값 한 줄로 세 구현체 중 하나를 고른다. Nest
 * 팩토리 프로바이더(hr-sync.module.ts)와 단위 테스트 양쪽에서 같은 로직을
 * 쓰기 위해 순수 함수로 뽑아 둔다.
 */
export function selectHrSourceAdapter(adapterType: HrSyncAdapterType | string | undefined, adapters: HrSourceAdapters): HrSourceAdapter {
  if (adapterType === 'DB') return adapters.db;
  if (adapterType === 'API') return adapters.api;
  return adapters.file;
}
