import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

// AllExceptionsFilter는 예외 응답에서 code/message/details만 그대로 전달하고
// 나머지 최상위 필드는 버린다 — approval-errors.ts와 동일 컨벤션으로 모든
// 구조화 데이터를 details 아래에 둔다.

export class CorrectionRequestNotFoundError extends NotFoundException {
  constructor(id: string) {
    super({ code: 'CORRECTION_REQUEST_NOT_FOUND', message: `정정 신청(${id})을 찾을 수 없습니다.` });
  }
}

export class CorrectionRequestVersionConflictError extends ConflictException {
  constructor(id: string, expectedVersion: number) {
    super({
      code: 'CORRECTION_REQUEST_VERSION_CONFLICT',
      message: '다른 관리자가 이미 처리했습니다.',
      details: { correctionRequestId: id, expectedVersion },
    });
  }
}

export class CorrectionTargetPeriodClosedError extends BadRequestException {
  constructor(siteId: string, periodYearMonth: string) {
    super({
      code: 'CORRECTION_TARGET_PERIOD_CLOSED',
      message:
        `사업장(${siteId})의 ${periodYearMonth} 기간은 이미 마감되어 정정을 반영할 수 없습니다. ` +
        `재마감 프로세스(STEP11)를 통해서만 반영 가능합니다.`,
      details: { siteId, periodYearMonth },
    });
  }
}

export class CorrectionRequestDeadlinePassedError extends BadRequestException {
  constructor(targetWorkDate: string, deadlineDays: number) {
    super({
      code: 'CORRECTION_REQUEST_DEADLINE_PASSED',
      message: `${targetWorkDate}에 대한 정정 신청 기한(월 종료 후 ${deadlineDays}일)이 지났습니다.`,
      details: { targetWorkDate, deadlineDays },
    });
  }
}

export class MalformedCorrectionPayloadSubmissionError extends BadRequestException {
  constructor(message: string) {
    super({ code: 'MALFORMED_CORRECTION_PAYLOAD', message });
  }
}
