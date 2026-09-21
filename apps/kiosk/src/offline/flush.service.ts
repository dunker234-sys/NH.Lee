import { kioskApi, KioskApiError } from '../api';
import { deviceStore } from '../deviceStore';
import { decryptPin } from './pinCipher';
import { runKioskFlush } from './kioskFlushLogic';
import { kioskQueueRepository } from './kioskQueue.repository';
import { lastSyncTime } from './lastSyncTime';

let flushing = false;

async function flush(): Promise<void> {
  const device = deviceStore.get();
  if (!device) return; // 페어링 전에는 큐 자체가 없다.
  if (flushing) return;
  flushing = true;
  try {
    await runKioskFlush({
      queue: kioskQueueRepository,
      api: {
        punchOne: (input) => kioskApi.punchOne(device.credential, input),
        punchBulk: (items, lastKnownServerSyncTime) => kioskApi.punchBulk(device.credential, items, lastKnownServerSyncTime),
        isRecoverableApiError: (e) => e instanceof KioskApiError,
      },
      crypto: { decryptPin: (ciphertext) => decryptPin(ciphertext, device.credential) },
      syncTime: lastSyncTime,
    });
  } finally {
    flushing = false;
  }
}

export const flushService = {
  trigger(): void {
    void flush();
  },
};
