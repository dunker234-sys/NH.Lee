/**
 * correction_request.afterValue의 스키마는 사유코드별로 STEP8이 확정했다
 * (apps/api/src/modules/correction/correction-payload.util.ts). 신청
 * 시점(CorrectionRequestService.submit)과 재계산 시점(AttendanceInputBuilderService)
 * 둘 다 같은 파서를 써서 검증하며, 기대한 모양이 아니면 조용히 무시하지
 * 않고 이 오류를 던진다.
 */
export class MalformedCorrectionPayloadError extends Error {
  constructor(correctionRequestId: string) {
    super(
      `CorrectionRequest(${correctionRequestId})의 afterValue가 reasonCode에 맞는 ` +
        `형태가 아닙니다 — 이 정정을 저장/계산에 반영할 수 없습니다.`,
    );
    this.name = 'MalformedCorrectionPayloadError';
  }
}

/** 마감된 기간(payroll_close.status !== 'OPEN')은 재마감 프로세스를 통해서만 갱신한다. */
export class PayrollPeriodClosedError extends Error {
  constructor(siteId: string, periodYearMonth: string) {
    super(
      `사업장(${siteId})의 ${periodYearMonth} 기간은 이미 마감되어 재계산할 수 ` +
        `없습니다. 재마감 프로세스를 통해서만 갱신 가능합니다.`,
    );
    this.name = 'PayrollPeriodClosedError';
  }
}

/** IN 타각이 전혀 없어 그 근로일을 계산할 수 없는 경우(core-rules의 MissingClockInError를 감싼다). */
export class RecalculationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecalculationInputError';
  }
}
