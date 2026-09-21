import { AlertLogChannel } from '@prisma/client';

export type TemplateVars = Record<string, unknown>;

export interface NotificationTemplate {
  title(vars: TemplateVars): string;
  body(vars: TemplateVars): string;
}

export interface NotificationTypeDefinition {
  /** true면 조용시간(PUSH만 대상)을 건너뛴다. 동의 억제에는 적용되지 않는다. */
  urgent: boolean;
  defaultChannels: AlertLogChannel[];
  /** 'ko'는 필수. 나머지 로케일이 없으면 ko로 폴백한다. */
  templates: Record<string, NotificationTemplate>;
}

/**
 * 알림 유형의 단일 진실 소스. 호출자(STEP5~9)가 매번 urgent/기본채널을
 * 정하지 않고 여기서 고정한다 — 비슷한 알림끼리 판단이 갈리는 걸 막는다.
 * en/vi를 나중에 추가하는 건 이 파일에 데이터를 더하는 일이지 notify()
 * 호출부를 하나도 건드리지 않는다.
 *
 * 알려진 값: DUMMY_TEST, DUMMY_URGENT_TEST(둘 다 STEP4.5 완료조건 증명용),
 * KIOSK_PIN_LOCKOUT(STEP5-B, 키오스크 PIN 무차별대입 잠금 시 사업장
 * 관리자에게 발송), SCHEDULE_CONFIRMED(STEP6, 계획근태 확정 시 그 스케줄의
 * 배정 대상 직원 본인에게 발송), OVERTIME_REQUEST_SUBMITTED/DISPATCH_REQUEST_
 * SUBMITTED(STEP6.5, 결재선 대상 관리자에게 승인 대기 알림), OVERTIME_REQUEST_
 * APPROVED/REJECTED/DISPATCH_REQUEST_APPROVED/REJECTED(STEP6.5, 신청자 본인에게
 * 처리 결과 알림), WORK_NOT_PROVIDED_JUDGED(STEP6.5, "근로 미제공" 판정 시
 * 근로자 본인에게 통지), EARLY_CLOCKIN_PATTERN_DETECTED(STEP6.5, 조기출근 반복
 * 탐지 시 사업장 결재선에 정리 요청), LEAVE_REQUEST_SUBMITTED/APPROVED/
 * REJECTED(STEP7, 휴가 신청 제출·승인·반려), LEAVE_CANCELLATION_REQUESTED/
 * APPROVED/REJECTED(STEP7, 사후 취소 요청·승인·반려), LEAVE_PROMOTION_
 * NOTICE_SENT(STEP7, §61 촉진 통지 — 전자문서 요건 충족을 위해 EMAIL 채널
 * 포함), LEAVE_PROMOTION_RESPONSE_RECORDED(STEP7, 근로자 회신 기록됨),
 * COMPENSATORY_LEAVE_CONVERTED(STEP7, §57 보상휴가 환산 완료),
 * SITE_CUTOVER_APPROVED(STEP7.5, 개시 데이터 이관 개통 승인 완료 — 결재선
 * 대상에게 발송), CORRECTION_REQUEST_SUBMITTED(STEP8, 결재선 대상에게
 * 정정 승인 요청), CORRECTION_REQUEST_APPROVED/REJECTED(STEP8, 신청자
 * 본인에게 처리 결과), ADMIN_CORRECTION_APPLIED(STEP8, 직권 정정 대상
 * 근로자 본인에게 통지), WEEKLY_OVERTIME_ALERT(STEP9, 52시간 알림 4단계 —
 * 근로자 본인 + 단계별 에스컬레이션 수신자에게 발송), WEEKLY_OVERTIME_PROJECTED
 * (STEP9, 예측 알림 — 남은 계획근태 합산 시 초과 예상되면 사업장 관리자에게
 * 사전 경고, 조정 후보 포함), NIGHT_WORK_HEALTH_CHECKUP_TARGET(STEP9, 야간작업
 * 특수건강진단 대상자 판정 시 사업장 관리자·HQ_HR에게 안내), HR_SYNC_REVIEW_
 * REQUIRED(STEP10, 인사연동 배치 변경 비율이 임계값을 초과해 자동적용이
 * 멈췄을 때 HQ_HR·ADMIN에게 검토 요청).
 */
export const NOTIFICATION_TYPES: Record<string, NotificationTypeDefinition> = {
  LEAVE_REQUEST_SUBMITTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '휴가 승인 요청',
        body: (v) => `${String(v.employeeName ?? '')}님이 ${String(v.startDate ?? '')}~${String(v.endDate ?? '')} 휴가를 신청했습니다.`,
      },
    },
  },
  LEAVE_REQUEST_APPROVED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '휴가 승인됨',
        body: (v) => `${String(v.startDate ?? '')}~${String(v.endDate ?? '')} 휴가 신청이 승인되었습니다.`,
      },
    },
  },
  LEAVE_REQUEST_REJECTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '휴가 반려됨',
        body: (v) => `${String(v.startDate ?? '')} 휴가 신청이 반려되었습니다. 사유: ${String(v.reason ?? '')}`,
      },
    },
  },
  LEAVE_CANCELLATION_REQUESTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '휴가 취소 승인 요청',
        body: (v) => `${String(v.employeeName ?? '')}님이 ${String(v.startDate ?? '')} 휴가의 사후 취소를 요청했습니다.`,
      },
    },
  },
  LEAVE_CANCELLATION_APPROVED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: { title: () => '휴가 취소 처리됨', body: (v) => `${String(v.startDate ?? '')} 휴가가 취소되었습니다.` },
    },
  },
  LEAVE_CANCELLATION_REJECTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: { title: () => '휴가 취소 반려됨', body: (v) => `${String(v.startDate ?? '')} 휴가 취소 요청이 반려되었습니다.` },
    },
  },
  LEAVE_PROMOTION_NOTICE_SENT: {
    urgent: false,
    defaultChannels: ['EMAIL', 'IN_APP'],
    templates: {
      ko: {
        title: () => '연차 사용 촉진 통지',
        body: (v) => `연차 사용 촉진(${String(v.step ?? '')}) 통지가 발송되었습니다. 기한: ${String(v.dueDate ?? '')}`,
      },
    },
  },
  LEAVE_PROMOTION_RESPONSE_RECORDED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: { title: () => '연차 사용 촉진 회신 기록됨', body: (v) => `사용 시기 특정 여부: ${String(v.specifiedUsageDates ?? '')}` },
    },
  },
  COMPENSATORY_LEAVE_CONVERTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: { title: () => '보상휴가 전환 완료', body: (v) => `연장근로가 보상휴가 ${String(v.compensatoryLeaveMinutes ?? '')}분으로 전환되었습니다.` },
    },
  },
  OVERTIME_REQUEST_SUBMITTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '연장근로 승인 요청',
        body: (v) => `${String(v.employeeName ?? '')}님이 ${String(v.targetDate ?? '')} 연장근로를 신청했습니다.`,
      },
    },
  },
  OVERTIME_REQUEST_APPROVED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '연장근로 승인됨',
        body: (v) => `${String(v.targetDate ?? '')} 연장근로 신청이 승인되었습니다.`,
      },
    },
  },
  OVERTIME_REQUEST_REJECTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '연장근로 반려됨',
        body: (v) => `${String(v.targetDate ?? '')} 연장근로 신청이 반려되었습니다.`,
      },
    },
  },
  DISPATCH_REQUEST_SUBMITTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '외근/지원 승인 요청',
        body: (v) => `${String(v.employeeName ?? '')}님이 ${String(v.startDate ?? '')}~${String(v.endDate ?? '')} 외근/지원을 신청했습니다.`,
      },
    },
  },
  DISPATCH_REQUEST_APPROVED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '외근/지원 승인됨',
        body: (v) => `${String(v.startDate ?? '')}~${String(v.endDate ?? '')} 외근/지원 신청이 승인되었습니다.`,
      },
    },
  },
  DISPATCH_REQUEST_REJECTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '외근/지원 반려됨',
        body: (v) => `${String(v.startDate ?? '')}~${String(v.endDate ?? '')} 외근/지원 신청이 반려되었습니다.`,
      },
    },
  },
  WORK_NOT_PROVIDED_JUDGED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '근로 미제공 판정 안내',
        body: (v) => `${String(v.workDate ?? '')}: 근로 미제공으로 판정되었습니다. 사유: ${String(v.reason ?? '')}`,
      },
    },
  },
  EARLY_CLOCKIN_PATTERN_DETECTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '조기출근 반복 패턴 감지',
        body: (v) => `${String(v.employeeName ?? '')}님이 ${String(v.yearMonth ?? '')}에 ${String(v.occurrenceCount ?? '')}회 조기출근했습니다. 정리가 필요합니다.`,
      },
    },
  },
  SCHEDULE_CONFIRMED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '근무 일정 확정',
        body: (v) => `${String(v.yearMonth ?? '')} 근무 일정이 확정되었습니다. 앱에서 확인해 주세요.`,
      },
    },
  },
  KIOSK_PIN_LOCKOUT: {
    urgent: true,
    defaultChannels: ['PUSH', 'EMAIL'],
    templates: {
      ko: {
        title: () => 'PIN 잠금 알림',
        body: (v) => `${String(v.employeeName ?? '')}(${String(v.employeeNo ?? '')})의 PIN이 ${String(v.kioskLabel ?? '')} 키오스크에서 잠겼습니다.`,
      },
    },
  },
  DUMMY_TEST: {
    urgent: false,
    defaultChannels: ['PUSH', 'EMAIL'],
    templates: {
      ko: {
        title: () => '테스트 알림',
        body: (v) => `더미 알림입니다. (${String(v.marker ?? '')})`,
      },
      // en/vi는 의도적으로 비워 둔다 — resolveTemplate()가 ko로 폴백하는지
      // 증명하는 완료조건 테스트가 이 공백을 이용한다.
    },
  },
  DUMMY_URGENT_TEST: {
    urgent: true,
    defaultChannels: ['PUSH'],
    templates: {
      ko: { title: () => '긴급 테스트 알림', body: () => '긴급 더미 알림입니다.' },
    },
  },
  SITE_CUTOVER_APPROVED: {
    urgent: false,
    // LEAVE_PROMOTION_NOTICE_SENT와 같은 이유 — 개통 승인은 근거 보존이
    // 필요한 상태변경 이벤트라 EMAIL을 포함한다(단순 PUSH만 두지 않는다).
    defaultChannels: ['EMAIL', 'IN_APP'],
    templates: {
      ko: {
        title: () => '사업장 개통 승인 완료',
        body: (v) => `사업장 개통(기준일 ${String(v.cutoverDate ?? '')})이 승인되었습니다.`,
      },
    },
  },
  CORRECTION_REQUEST_SUBMITTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '근태 정정 승인 요청',
        body: (v) => `${String(v.employeeName ?? '')}님이 ${String(v.targetWorkDate ?? '')} 근태 정정을 신청했습니다.`,
      },
    },
  },
  CORRECTION_REQUEST_APPROVED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '근태 정정 승인됨',
        body: (v) => `${String(v.targetWorkDate ?? '')} 근태 정정 신청이 승인되었습니다.`,
      },
    },
  },
  CORRECTION_REQUEST_REJECTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '근태 정정 반려됨',
        body: (v) => `${String(v.targetWorkDate ?? '')} 근태 정정 신청이 반려되었습니다. 사유: ${String(v.reason ?? '')}`,
      },
    },
  },
  ADMIN_CORRECTION_APPLIED: {
    urgent: false,
    // 직권 정정은 본인 모르게 근태가 바뀌는 것이라 근거 보존이 필요한
    // 상태변경 이벤트다 — SITE_CUTOVER_APPROVED/LEAVE_PROMOTION_NOTICE_SENT와
    // 같은 이유로 EMAIL을 포함한다.
    defaultChannels: ['EMAIL', 'IN_APP'],
    templates: {
      ko: {
        title: () => '관리자 직권 정정 안내',
        body: (v) => `${String(v.targetWorkDate ?? '')} 근태가 관리자에 의해 직권 정정되었습니다. 사유: ${String(v.reason ?? '')}`,
      },
    },
  },
  WEEKLY_OVERTIME_ALERT: {
    // "위험" 이상은 조용시간을 뚫고서라도 즉시 알아야 하는 성격이지만,
    // urgent 여부를 단계별로 나누면 notify() 호출부가 단계를 다시 판단해야
    // 한다 — DUMMY_URGENT_TEST처럼 유형당 단일 값 원칙을 지키기 위해
    // WARNING 이상부터 urgent로 취급한다(주의는 정보성).
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: (v) => `주간 근로시간 ${String(v.stage ?? '')} 알림`,
        body: (v) =>
          `${String(v.employeeName ?? '')}(${String(v.employeeNo ?? '')})님의 ${String(v.weekStartDate ?? '')} 주 누적 ` +
          `근로시간이 ${(Number(v.actualWeeklyMinutes ?? 0) / 60).toFixed(1)}시간입니다. 단계: ${String(v.stage ?? '')}`,
      },
    },
  },
  WEEKLY_OVERTIME_PROJECTED: {
    urgent: false,
    defaultChannels: ['PUSH'],
    templates: {
      ko: {
        title: () => '주간 근로시간 초과 예상',
        body: (v) =>
          `${String(v.employeeName ?? '')}님이 남은 계획근태를 모두 채우면 이번 주 ${String(v.projectedStage ?? '')} ` +
          `단계(예상 ${(Number(v.projectedTotalMinutes ?? 0) / 60).toFixed(1)}시간)에 도달할 것으로 예상됩니다. 스케줄 조정을 검토해 주세요.`,
      },
    },
  },
  HR_SYNC_REVIEW_REQUIRED: {
    // 대량 변경(원본 오류로 인한 대량 사고 가능성)이 자동 적용을 건너뛰고
    // 멈춰선 상태라 조용시간을 뚫고서라도 관리자가 즉시 알아야 한다.
    urgent: true,
    defaultChannels: ['PUSH', 'EMAIL', 'IN_APP'],
    templates: {
      ko: {
        title: () => '인사연동 배치 확인 필요',
        body: (v) =>
          `인사연동 배치의 변경 비율(${(Number(v.changeRatio ?? 0) * 100).toFixed(1)}%)이 임계값을 초과해 ` +
          `자동 적용되지 않았습니다. 신규 ${String(v.newCount ?? 0)}건, 변경 ${String(v.changedCount ?? 0)}건, ` +
          `퇴사 ${String(v.departedCount ?? 0)}건, 오류 ${String(v.errorCount ?? 0)}건. 검토 후 승인/기각해 주세요.`,
      },
    },
  },
  NIGHT_WORK_HEALTH_CHECKUP_TARGET: {
    urgent: false,
    defaultChannels: ['EMAIL', 'IN_APP'],
    templates: {
      ko: {
        title: () => '야간작업 특수건강진단 대상자 안내',
        body: (v) =>
          `${String(v.employeeName ?? '')}(${String(v.employeeNo ?? '')})님이 산업안전보건법 시행규칙 별표22 제4호 ` +
          `기준(${String(v.criteriaMet ?? '')})에 해당해 특수건강진단 대상자로 판정되었습니다.`,
      },
    },
  },
};

export function resolveNotificationType(type: string): NotificationTypeDefinition {
  const def = NOTIFICATION_TYPES[type];
  if (!def) {
    throw new Error(`알 수 없는 알림 유형입니다: ${type}. notification-types.registry.ts에 먼저 등록하세요.`);
  }
  return def;
}

export function resolveTemplate(type: string, locale: string): NotificationTemplate {
  const def = resolveNotificationType(type);
  const template = def.templates[locale] ?? def.templates.ko;
  if (!template) {
    throw new Error(`알림 유형 '${type}'에 ko 템플릿이 없습니다 — ko는 필수입니다.`);
  }
  return template;
}
