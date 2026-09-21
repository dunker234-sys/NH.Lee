import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

// AllExceptionsFilter(common/filters/all-exceptions.filter.ts)는 예외 응답에서
// code/message/details만 그대로 전달하고 나머지 최상위 필드는 버린다 — 그래서
// 이 파일의 모든 구조화 데이터는 details 아래에 둔다(schedule-errors.ts와 동일
// 컨벤션, STEP6에서 실측한 버그이므로 처음부터 준수).

export class OvertimeRequestNotFoundError extends NotFoundException {
  constructor(id: string) {
    super({ code: 'OVERTIME_REQUEST_NOT_FOUND', message: `연장근로 신청(${id})을 찾을 수 없습니다.` });
  }
}

export class OvertimeRequestVersionConflictError extends ConflictException {
  constructor(id: string, expectedVersion: number) {
    super({
      code: 'OVERTIME_REQUEST_VERSION_CONFLICT',
      message: '다른 관리자가 이미 처리했습니다.',
      details: { overtimeRequestId: id, expectedVersion },
    });
  }
}

export class DispatchRequestNotFoundError extends NotFoundException {
  constructor(id: string) {
    super({ code: 'DISPATCH_REQUEST_NOT_FOUND', message: `외근/지원 신청(${id})을 찾을 수 없습니다.` });
  }
}

export class DispatchRequestVersionConflictError extends ConflictException {
  constructor(id: string, expectedVersion: number) {
    super({
      code: 'DISPATCH_REQUEST_VERSION_CONFLICT',
      message: '다른 관리자가 이미 처리했습니다.',
      details: { dispatchRequestId: id, expectedVersion },
    });
  }
}

export class DispatchPreApprovalPastDateError extends BadRequestException {
  constructor(startDate: string) {
    super({
      code: 'DISPATCH_PRE_APPROVAL_PAST_DATE',
      message: '사전 신청(isPostHoc=false)은 과거 날짜를 대상 기간으로 할 수 없습니다. 긴급 지원은 사후 신청(isPostHoc=true)을 쓰세요.',
      details: { startDate },
    });
  }
}

export class WorkNotProvidedReasonRequiredError extends BadRequestException {
  constructor() {
    super({ code: 'WORK_NOT_PROVIDED_REASON_REQUIRED', message: '근로 미제공 판정에는 사유가 필수입니다.' });
  }
}

export class DelegationNotFoundError extends NotFoundException {
  constructor(id: string) {
    super({ code: 'DELEGATION_NOT_FOUND', message: `위임(${id})을 찾을 수 없습니다.` });
  }
}

export class DelegationForbiddenError extends BadRequestException {
  constructor() {
    super({ code: 'DELEGATION_FORBIDDEN', message: '본인이 위임한 건만 철회할 수 있습니다.' });
  }
}
