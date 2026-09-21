export type KioskQueueStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED_RETRYABLE';

export interface KioskQueueRow {
  localId: string;
  employeeNo: string;
  /** pinCipher.ts로 암호화된 값 — 평문 PIN은 큐에 절대 저장하지 않는다. */
  pinCiphertext: string;
  punchType: 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN';
  recordedAt: string;
  clientEventId: string;
  status: KioskQueueStatus;
  attemptCount: number;
  createdAt: string;
}

export const QUEUE_STORAGE_KEY = 'kiosk_punch_queue_v1';
