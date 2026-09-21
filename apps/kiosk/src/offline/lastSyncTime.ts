const KEY = 'kiosk_last_known_server_sync_time_v1';

export const lastSyncTime = {
  async get(): Promise<string> {
    return localStorage.getItem(KEY) ?? new Date(0).toISOString();
  },
  async set(iso: string): Promise<void> {
    localStorage.setItem(KEY, iso);
  },
};
