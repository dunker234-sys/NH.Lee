import { VerificationLevel } from '@prisma/client';

/**
 * 기기 신뢰 여부를 타각 인증수준으로 변환한다. 미등록(비신뢰) 기기라고 로그인이나
 * 타각을 막지 않는다 — 대신 LOW로 기록해 검토 큐로 보낸다(CLAUDE.md).
 * 실제 POST /punches 엔드포인트는 STEP 4에서 만들지만, 로그인 시 판정되는
 * deviceTrust가 이 값으로 이어진다는 것을 이번 STEP에서 증명해 둔다.
 */
export function resolveVerificationLevel(deviceTrusted: boolean): VerificationLevel {
  return deviceTrusted ? 'NORMAL' : 'LOW';
}
