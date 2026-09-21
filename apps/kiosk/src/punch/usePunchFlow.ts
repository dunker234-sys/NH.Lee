import { useCallback, useEffect, useRef, useState } from 'react';
import { kioskApi, KioskApiError } from '../api';
import { deviceStore } from '../deviceStore';
import { flushService } from '../offline/flush.service';
import { kioskQueueRepository } from '../offline/kioskQueue.repository';
import { encryptPin } from '../offline/pinCipher';

export type PunchType = 'IN' | 'OUT' | 'BREAK_OUT' | 'BREAK_IN';

export type PunchFlowState =
  | { phase: 'IDLE' }
  | { phase: 'SUBMITTING' }
  | { phase: 'RESULT'; outcome: 'ONLINE_SUCCESS'; maskedName: string; punchType: PunchType }
  | { phase: 'RESULT'; outcome: 'OFFLINE_SAVED'; punchType: PunchType }
  | { phase: 'RESULT'; outcome: 'ERROR'; message: string };

const RESULT_DISPLAY_MS = 3000;

/**
 * 계획서 §7.2/§9.2의 상태기계: IDLE → SUBMITTING → RESULT → (3초) → IDLE.
 * 온라인 우선 시도(큐에 먼저 쌓고 flush하는 게 아니라 즉시 네트워크
 * 시도) — 성공 경로에 불필요한 왕복을 추가하지 않는다. 네트워크
 * 실패에서만 오프라인 큐로 폴백한다(§7.2 결정 (A) — PIN 미검증인 채로
 * 입력을 받고, 실제 검증은 재연결 시점으로 미룬다).
 */
export function usePunchFlow() {
  const [state, setState] = useState<PunchFlowState>({ phase: 'IDLE' });
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  function scheduleReset() {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setState({ phase: 'IDLE' }), RESULT_DISPLAY_MS);
  }

  const submit = useCallback(async (employeeNo: string, pin: string, punchType: PunchType) => {
    const device = deviceStore.get();
    if (!device) return;

    setState({ phase: 'SUBMITTING' });
    const recordedAt = new Date().toISOString(); // 탭 시점 1회 확정 — 재전송에서 재계산하지 않는다.
    const clientEventId = crypto.randomUUID();

    try {
      const result = await kioskApi.punchOne(device.credential, { employeeNo, pin, punchType, recordedAt, clientEventId });
      setState({ phase: 'RESULT', outcome: 'ONLINE_SUCCESS', maskedName: result.maskedName, punchType });
      scheduleReset();
    } catch (e) {
      if (e instanceof KioskApiError) {
        // 서버에 도달했고 서버가 명시적으로 거부했다(PIN 오류/잠김 등) — 오프라인
        // 문제가 아니므로 큐에 넣지 않는다. 재시도해도 같은 결과다.
        const message = (e.body as { message?: string } | null)?.message ?? '처리 중 오류가 발생했습니다.';
        setState({ phase: 'RESULT', outcome: 'ERROR', message });
        scheduleReset();
        return;
      }

      // 네트워크 자체에 도달하지 못함 — 오프라인으로 간주하고 로컬에 저장한다.
      const pinCiphertext = await encryptPin(pin, device.credential);
      await kioskQueueRepository.enqueue({
        localId: crypto.randomUUID(),
        employeeNo,
        pinCiphertext,
        punchType,
        recordedAt,
        clientEventId,
        status: 'PENDING',
        attemptCount: 0,
        createdAt: new Date().toISOString(),
      });
      flushService.trigger();
      setState({ phase: 'RESULT', outcome: 'OFFLINE_SAVED', punchType });
      scheduleReset();
    }
  }, []);

  const reset = useCallback(() => setState({ phase: 'IDLE' }), []);

  return { state, submit, reset };
}
