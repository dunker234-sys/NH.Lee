import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'last_known_server_sync_time_v1';

/** POST /punches/bulk의 lastKnownServerSyncTime — 서버가 기기 시계 되감기
 * 의심(DEVICE_CLOCK_ROLLBACK_SUSPECTED)을 판정하는 데 쓴다. 성공적으로
 * 서버와 통신할 때마다 갱신한다. */
export const lastSyncTime = {
  async get(): Promise<string> {
    return (await AsyncStorage.getItem(KEY)) ?? new Date(0).toISOString();
  },
  async set(iso: string): Promise<void> {
    await AsyncStorage.setItem(KEY, iso);
  },
};
