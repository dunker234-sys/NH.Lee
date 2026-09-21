import { CorrectionReasonCode } from '@prisma/client';
import { PunchEvent, PunchType } from '@attendance/core-rules';
import { MalformedCorrectionPayloadError } from '../../modules/recalculation/errors/recalculation-errors';

/**
 * correction_request.afterValue의 실제 스키마(STEP8이 확정). 사유코드별로
 * 기대하는 모양이 다르다. modules/recalculation/attendance-input-builder.service.ts
 * (재계산 시점)와 modules/correction/*(신청 시점) 둘 다 이 파일의 검증
 * 함수를 재사용해 파싱 로직이 갈라지지 않게 한다 — common/에 둔 이유는
 * 두 모듈이 서로를 의존하지 않고도 이 파일을 공유하게 하기 위해서다.
 */
export const PUNCH_AFFECTING_REASON_CODES: readonly CorrectionReasonCode[] = [
  'PUNCH_MISSING',
  'DEVICE_ERROR',
  'NETWORK_FAILURE',
];

const PUNCH_TYPES: readonly string[] = ['IN', 'OUT', 'BREAK_OUT', 'BREAK_IN'];

export interface CorrectionRequestLike {
  id: string;
  reasonCode: CorrectionReasonCode;
  afterValue: unknown;
}

/** PUNCH_MISSING/DEVICE_ERROR/NETWORK_FAILURE의 afterValue를 {punchType, recordedAt}로 파싱한다. */
export function parsePunchCorrectionPayload(correction: CorrectionRequestLike): PunchEvent {
  const v = correction.afterValue;
  if (
    v !== null &&
    typeof v === 'object' &&
    'punchType' in v &&
    'recordedAt' in v &&
    typeof (v as Record<string, unknown>).punchType === 'string' &&
    typeof (v as Record<string, unknown>).recordedAt === 'string' &&
    PUNCH_TYPES.includes((v as Record<string, unknown>).punchType as string)
  ) {
    const payload = v as { punchType: PunchType; recordedAt: string };
    return { type: payload.punchType, recordedAt: payload.recordedAt };
  }
  throw new MalformedCorrectionPayloadError(correction.id);
}

/** BREAK_NOT_GRANTED의 afterValue가 {breakNotGranted: true} 모양인지 확인한다. */
export function isValidBreakNotGrantedPayload(afterValue: unknown): boolean {
  return (
    afterValue !== null &&
    typeof afterValue === 'object' &&
    (afterValue as Record<string, unknown>).breakNotGranted === true
  );
}

/**
 * 신청 시점 검증 — 사유코드에 맞는 모양이 아니면 아예 저장되지 않게 막는다
 * (기존에는 재계산 시점에만 걸러져 잘못된 정정이 승인까지 통과할 수 있었다).
 */
export function assertValidAfterValueForSubmission(reasonCode: CorrectionReasonCode, afterValue: unknown, correctionId = 'PENDING'): void {
  if (PUNCH_AFFECTING_REASON_CODES.includes(reasonCode)) {
    parsePunchCorrectionPayload({ id: correctionId, reasonCode, afterValue });
    return;
  }
  if (reasonCode === 'BREAK_NOT_GRANTED') {
    if (!isValidBreakNotGrantedPayload(afterValue)) {
      throw new MalformedCorrectionPayloadError(correctionId);
    }
    return;
  }
  // DISPATCH/LOCATION_ERROR/SCHEDULE_CHANGE/OTHER — 계산에 반영하지 않는
  // 정보성 사유라 afterValue 모양을 강제하지 않는다.
}
