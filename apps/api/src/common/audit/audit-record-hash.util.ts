import { canonicalJson, sha256 } from '../crypto/hash.util';

/**
 * AuditLogService.write()와 STEP8 무결성 검증 배치가 절대 다른 방식으로
 * 해시를 재계산하지 않도록 입력 조립을 이 한 곳으로 강제한다 — 두 곳이
 * 갈라지면 정상 데이터에서도 무결성 검증이 오탐을 낸다(ROADMAP STEP8
 * 완료조건 4 위반).
 */
export interface AuditRecordHashInput {
  actorPrincipal: string;
  actorRole: string;
  eventType: string;
  resourceType: string;
  resourceId?: string | null;
  beforeValue?: unknown;
  afterValue?: unknown;
  reason?: string | null;
  occurredAt: Date;
  prevHash: string | null;
}

export function computeAuditRecordHash(input: AuditRecordHashInput): string {
  return sha256(
    canonicalJson({
      actorPrincipal: input.actorPrincipal,
      actorRole: input.actorRole,
      eventType: input.eventType,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      beforeValue: input.beforeValue ?? null,
      afterValue: input.afterValue ?? null,
      reason: input.reason ?? null,
      occurredAt: input.occurredAt.toISOString(),
      prevHash: input.prevHash,
    }),
  );
}
