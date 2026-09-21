const STORAGE_KEY = 'kiosk_device_v1';

export interface StoredKioskDevice {
  kioskDeviceId: string;
  siteId: string;
  siteName: string;
  credential: string;
}

/** 페어링 결과를 로컬에 영속한다 — 로컬 저장소를 지우기 전까지 PairingScreen이
 * 다시 뜨지 않는다(계획서 §2.2). */
export const deviceStore = {
  get(): StoredKioskDevice | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredKioskDevice;
    } catch {
      return null;
    }
  },
  set(device: StoredKioskDevice): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(device));
  },
  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  },
};
