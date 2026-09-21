import { ForbiddenException, InternalServerErrorException, Logger } from '@nestjs/common';
import { OrgScope } from './org-scope.types';

const logger = new Logger('OrgScope');

/** 스코프 누락 — 프로그래밍 오류로 취급한다(사용자 잘못이 아니다). 500. */
export class OrgScopeRequiredError extends InternalServerErrorException {
  constructor() {
    super({ code: 'ORG_SCOPE_REQUIRED', message: '조직 스코프 없이 데이터에 접근할 수 없습니다.' });
  }
}

/** 스코프는 있으나 요청한 사업장이 범위 밖 — 정상적인 권한 거부. 403. */
export class OrgScopeDeniedError extends ForbiddenException {
  constructor(siteId: string) {
    super({ code: 'ORG_SCOPE_DENIED', message: `사업장(${siteId})에 대한 접근 권한이 없습니다.` });
  }
}

/**
 * 조직 스코프 없이 스코프 데이터에 접근하려는 호출을 런타임에 차단한다.
 * 정상 HTTP 경로에서는 PrincipalGuard가 항상 scope를 채우므로 발생하지 않는다 —
 * 이 함수가 실제로 예외를 던지는 경우는 가드를 거치지 않고 리포지토리를 직접
 * 호출한 버그(예: SYSTEM 배치가 runAsSystem() 없이 호출)뿐이며, 그런 버그를
 * "조용히 전체 데이터 반환"이 아니라 즉시 실패로 드러내는 것이 이 함수의 목적이다.
 */
export function assertScope(scope: OrgScope | null | undefined): asserts scope is OrgScope {
  if (scope == null) {
    logger.error('ORG_SCOPE_REQUIRED_VIOLATION: scope 없이 스코프 데이터 접근이 시도되었습니다.');
    throw new OrgScopeRequiredError();
  }
}

/** scope는 존재하지만 요청한 siteId가 범위 밖이면 거부한다. */
export function assertSiteInScope(scope: OrgScope, siteId: string): void {
  if (scope.kind === 'ALL') return;
  if (!scope.siteIds.includes(siteId)) {
    throw new OrgScopeDeniedError(siteId);
  }
}
