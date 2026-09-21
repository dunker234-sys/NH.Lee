import { BadRequestException, ConflictException } from '@nestjs/common';

// AllExceptionsFilter는 code/message/details만 전달한다 — approval-errors.ts와
// 동일 컨벤션으로 구조화 데이터는 details 아래에만 둔다.

export class CutoverDateNotSetError extends BadRequestException {
  constructor(siteId: string) {
    super({
      code: 'CUTOVER_DATE_NOT_SET',
      message: '이 사업장은 아직 개통 기준일이 설정되지 않았습니다. 먼저 개통 기준일을 설정하세요.',
      details: { siteId },
    });
  }
}

export class SiteCutoverAlreadyApprovedError extends ConflictException {
  constructor(siteId: string) {
    super({
      code: 'SITE_CUTOVER_ALREADY_APPROVED',
      message: '이미 개통 승인이 완료된 사업장입니다. 기준일을 다시 바꿀 수 없습니다.',
      details: { siteId },
    });
  }
}

export class MigrationCommitTokenInvalidError extends BadRequestException {
  constructor() {
    super({ code: 'MIGRATION_COMMIT_TOKEN_INVALID', message: '검증 토큰이 만료되었거나 존재하지 않습니다. 다시 업로드하세요.' });
  }
}

export class CutoverReconciliationNotZeroError extends BadRequestException {
  constructor(siteId: string, unresolvedCount: number, totalRecords: number) {
    super({
      code: 'CUTOVER_RECONCILIATION_NOT_ZERO',
      message: `근로자 단위 대사 불일치가 ${unresolvedCount}건 남아 있어 개통을 승인할 수 없습니다. 차이가 0이 될 때까지 이관 데이터를 보정하세요.`,
      details: { siteId, unresolvedCount, totalRecords },
    });
  }
}
