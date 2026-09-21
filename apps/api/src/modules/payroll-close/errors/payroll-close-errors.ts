import { BadRequestException, NotFoundException } from '@nestjs/common';

export class PayrollCloseNotFoundError extends NotFoundException {
  constructor(siteId: string, periodYearMonth: string) {
    super({ code: 'PAYROLL_CLOSE_NOT_FOUND', message: `마감(${siteId}, ${periodYearMonth})을 찾을 수 없습니다.` });
  }
}

export class PayrollCloseBlockedError extends BadRequestException {
  constructor(siteId: string, periodYearMonth: string, reasons: string[]) {
    super({
      code: 'PAYROLL_CLOSE_BLOCKED',
      message: `사업장(${siteId})의 ${periodYearMonth} 마감이 미해결 항목으로 차단되었습니다: ${reasons.join(', ')}`,
      details: { siteId, periodYearMonth, reasons },
    });
  }
}

export class PayrollCloseStageOrderError extends BadRequestException {
  constructor(currentStage: string, expectedStage: string) {
    super({
      code: 'PAYROLL_CLOSE_STAGE_ORDER_VIOLATION',
      message: `현재 단계(${currentStage})에서는 이 전이를 수행할 수 없습니다(기대 단계: ${expectedStage}).`,
      details: { currentStage, expectedStage },
    });
  }
}

export class PayrollCloseValidationRequiredError extends BadRequestException {
  constructor(reason: string) {
    super({
      code: 'PAYROLL_CLOSE_VALIDATION_REQUIRED',
      message: `마감 전 자동 검증 확인이 필요합니다: ${reason}`,
    });
  }
}

export class PayrollCloseReopenReasonRequiredError extends BadRequestException {
  constructor() {
    super({ code: 'PAYROLL_CLOSE_REOPEN_REASON_REQUIRED', message: '마감취소 사유를 입력해야 합니다.' });
  }
}
