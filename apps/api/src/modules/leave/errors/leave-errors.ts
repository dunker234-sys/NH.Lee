import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

// AllExceptionsFilter(common/filters/all-exceptions.filter.ts)는 예외 응답에서
// code/message/details만 그대로 전달하고 나머지 최상위 필드는 버린다 — 그래서
// 이 파일의 모든 구조화 데이터는 details 아래에 둔다(approval-errors.ts와
// 동일 컨벤션).

export class LeaveTypeNotFoundError extends NotFoundException {
  constructor(id: string) {
    super({ code: 'LEAVE_TYPE_NOT_FOUND', message: `휴가 유형(${id})을 찾을 수 없습니다.` });
  }
}

export class LeaveRequestNotFoundError extends NotFoundException {
  constructor(id: string) {
    super({ code: 'LEAVE_REQUEST_NOT_FOUND', message: `휴가 신청(${id})을 찾을 수 없습니다.` });
  }
}

export class LeaveRequestVersionConflictError extends ConflictException {
  constructor(id: string, expectedVersion: number) {
    super({
      code: 'LEAVE_REQUEST_VERSION_CONFLICT',
      message: '다른 관리자가 이미 처리했습니다.',
      details: { leaveRequestId: id, expectedVersion },
    });
  }
}

export class LeaveApplicationDeadlinePassedError extends BadRequestException {
  constructor(deadlineDaysBeforeUse: number) {
    super({
      code: 'LEAVE_APPLICATION_DEADLINE_PASSED',
      message: `이 휴가 유형은 사용일 ${deadlineDaysBeforeUse}일 전까지만 신청할 수 있습니다.`,
      details: { deadlineDaysBeforeUse },
    });
  }
}

export class LeaveInsufficientBalanceError extends BadRequestException {
  constructor(remainingDays: number, requestedDays: number) {
    super({
      code: 'LEAVE_INSUFFICIENT_BALANCE',
      message: '잔여 휴가 일수가 부족합니다.',
      details: { remainingDays, requestedDays },
    });
  }
}

export class LeaveCancellationNotAllowedError extends BadRequestException {
  constructor(status: string) {
    super({
      code: 'LEAVE_CANCELLATION_NOT_ALLOWED',
      message: `현재 상태(${status})에서는 취소할 수 없습니다.`,
      details: { status },
    });
  }
}

export class CompensatoryLeaveAgreementMissingError extends BadRequestException {
  constructor() {
    super({
      code: 'COMPENSATORY_LEAVE_AGREEMENT_MISSING',
      message: '근로자대표 서면합의(보상휴가)가 등록되어 있지 않아 전환할 수 없습니다.',
    });
  }
}

export class CompensatoryLeaveAlreadyConvertedError extends ConflictException {
  constructor(overtimeRequestId: string) {
    super({
      code: 'COMPENSATORY_LEAVE_ALREADY_CONVERTED',
      message: '이미 보상휴가로 전환된 연장근로입니다.',
      details: { overtimeRequestId },
    });
  }
}

export class LeavePromotionPolicyStatutoryViolationError extends BadRequestException {
  constructor(violations: unknown) {
    super({
      code: 'LEAVE_PROMOTION_POLICY_STATUTORY_VIOLATION',
      message: '연차 사용 촉진 기한은 법정 기한보다 늦게 설정할 수 없습니다.',
      details: { violations },
    });
  }
}

export class LeavePromotionLogNotFoundError extends NotFoundException {
  constructor(id: string) {
    super({ code: 'LEAVE_PROMOTION_LOG_NOT_FOUND', message: `촉진 절차 기록(${id})을 찾을 수 없습니다.` });
  }
}

export class LeaveBalanceNotFoundError extends NotFoundException {
  constructor(id: string) {
    super({ code: 'LEAVE_BALANCE_NOT_FOUND', message: `휴가 잔액(${id})을 찾을 수 없습니다.` });
  }
}
