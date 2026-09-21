import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

export interface ScheduleConflictValue {
  scheduleId: string;
  yourValue: Record<string, unknown>;
  currentValue: Record<string, unknown> | null;
}

// AllExceptionsFilter(common/filters/all-exceptions.filter.ts)는 예외
// 응답에서 code/message/details만 그대로 전달하고 나머지 최상위 필드는
// 버린다 — 그래서 이 파일의 모든 구조화 데이터는 details 아래에 둔다
// (최상위에 두면 응답에서 조용히 사라진다, 실제로 겪은 버그).

/** 단일 셀 PATCH 낙관적 잠금 충돌(§3.2). details.currentValue가 서버의
 * 현재 행 전체를 담아, admin-web이 추가 왕복 없이 "내 값/상대 값" 비교
 * UI를 그릴 수 있게 한다. */
export class ScheduleVersionConflictError extends ConflictException {
  constructor(conflict: ScheduleConflictValue) {
    super({
      code: 'SCHEDULE_VERSION_CONFLICT',
      message: '다른 사용자가 먼저 저장했습니다.',
      details: conflict,
    });
  }
}

/** 벌크 PATCH 부분 충돌 — 전부-아니면-없음이므로 충돌 목록 전체를 반환한다. */
export class ScheduleBulkVersionConflictError extends ConflictException {
  constructor(conflicts: ScheduleConflictValue[]) {
    super({
      code: 'SCHEDULE_BULK_VERSION_CONFLICT',
      message: '일부 셀이 충돌해 전체 배치를 저장하지 않았습니다.',
      details: { conflicts },
    });
  }
}

export class ScheduleNotFoundError extends NotFoundException {
  constructor(scheduleId: string) {
    super({ code: 'SCHEDULE_NOT_FOUND', message: `스케줄(${scheduleId})을 찾을 수 없습니다.` });
  }
}

export class ShiftTemplateInUseError extends ConflictException {
  constructor(blockingScheduleIds: string[]) {
    super({
      code: 'SHIFT_TEMPLATE_IN_USE',
      message: '이 교대 패턴을 참조하는 미래 스케줄이 있어 삭제할 수 없습니다.',
      details: { blockingScheduleIds },
    });
  }
}

export interface ScheduleValidationViolation {
  scheduleId?: string;
  code: string;
  message: string;
}

/** 저장/확정 시점 hard-block 위반(§3.5) — 미성년/임신/서면합의 미비 등
 * override 불가능한 위반. */
export class ScheduleHardBlockError extends BadRequestException {
  constructor(violations: ScheduleValidationViolation[]) {
    super({
      code: 'SCHEDULE_HARD_BLOCK',
      message: '법령상 저장할 수 없는 배정이 포함되어 있습니다.',
      details: { violations },
    });
  }
}

/** CONFIRM 시점 soft-warning이 override 없이 남아있는 경우. */
export class ScheduleUnresolvedWarningError extends BadRequestException {
  constructor(violations: ScheduleValidationViolation[]) {
    super({
      code: 'SCHEDULE_UNRESOLVED_WARNING',
      message: '해결되지 않은 경고가 있어 확정할 수 없습니다. override와 사유를 함께 보내세요.',
      details: { violations },
    });
  }
}

export class ScheduleGridStaleError extends ConflictException {
  constructor(diff: unknown) {
    super({
      code: 'SCHEDULE_GRID_STALE',
      message: '엑셀을 읽은 시점 이후 그리드가 변경되었습니다. 변경 내역을 확인하세요.',
      details: { diff },
    });
  }
}
