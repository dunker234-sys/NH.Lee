import { AnnualLeavePolicyConfig } from '../../types/policy-config';
import { calculateFullYearAnnualLeaveGrant, FullYearGrantInput, FullYearGrantResult } from './full-year-grant';
import { calculateMonthlyAccrualLeave, MonthlyAccrualResult, MonthlyAttendanceRecord } from './monthly-accrual';
import { calculateSeniorityAddonDays } from './seniority-addon';

export type AnnualLeaveGrantReasonCode =
  | 'NOT_APPLICABLE_UNDER_FIVE'
  | 'NOT_APPLICABLE_ULTRA_PART_TIME'
  | 'MONTHLY_ACCRUAL'
  | 'FULL_YEAR_GRANT';

export interface AnnualLeaveGrantInput {
  /** 시행령§7의2③ 5인 연속 판정 결과 — determineAnnualLeaveApplicability()의
   * 출력을 그대로 주입받는다(이 함수는 재판정하지 않는다). */
  leaveApplicable: boolean;
  fourWeekAverageWeeklyScheduledMinutes: number;
  /** 이번 산정기간이 몇 년차인지(정수). 0이면 1년 미만(§60② 경로만 탄다) —
   * 대법 2021다227100의 "정확히 1년" 경계는 이 값이 0인 채로 근로관계가
   * 종료돼 calculateFullYearAnnualLeaveGrant가 아예 호출되지 않는 것으로
   * 구조적으로 보장된다. */
  yearsOfService: number;
  /** yearsOfService >= 1일 때 필수 */
  fullYear?: FullYearGrantInput;
  /** yearsOfService < 1일 때 필수 */
  monthly?: { months: MonthlyAttendanceRecord[] };
  /** monthly 경로에 필요 */
  firstYearEndDate?: string;
}

export interface AnnualLeaveGrantBasis {
  reasonCode: AnnualLeaveGrantReasonCode;
  fullYearResult?: FullYearGrantResult;
  monthlyResult?: MonthlyAccrualResult;
  seniorityAddonDays: number;
  cappedAt: number | null;
  legalReferences: string[];
}

export interface AnnualLeaveGrantResult {
  grantedDays: number;
  basis: AnnualLeaveGrantBasis;
}

/**
 * 연차 발생일수 산정 합성 진입점. §18③(초단시간 미적용) → 시행령§7의2③
 * (5인 미만 미적용) 순으로 게이트를 통과한 뒤, yearsOfService<1이면 §60②
 * (월별 개근 가산, 최대 11일)만, >=1이면 §60①(80%+15일)+§60④(가산, 25일
 * 상한)을 계산한다. 15일 발생 경로(fullYear)는 yearsOfService>=1일 때만
 * 호출되므로, 대법 2021다227100 같은 "정확히 1년" 경계 사례는 호출자가
 * yearsOfService=0으로 넘기기만 하면 15일이 섞일 코드 경로 자체가 없다.
 */
export function calculateAnnualLeaveGrant(
  input: AnnualLeaveGrantInput,
  policy: AnnualLeavePolicyConfig,
): AnnualLeaveGrantResult {
  if (!input.leaveApplicable) {
    return {
      grantedDays: 0,
      basis: {
        reasonCode: 'NOT_APPLICABLE_UNDER_FIVE',
        seniorityAddonDays: 0,
        cappedAt: null,
        legalReferences: ['시행령 제7조의2③'],
      },
    };
  }

  if (input.fourWeekAverageWeeklyScheduledMinutes < policy.ultraPartTimeWeeklyThresholdMinutes) {
    return {
      grantedDays: 0,
      basis: {
        reasonCode: 'NOT_APPLICABLE_ULTRA_PART_TIME',
        seniorityAddonDays: 0,
        cappedAt: null,
        legalReferences: ['근로기준법 제18조③'],
      },
    };
  }

  if (input.yearsOfService < 1) {
    if (!input.monthly || !input.firstYearEndDate) {
      throw new Error('yearsOfService<1이면 monthly와 firstYearEndDate가 필수입니다.');
    }
    const monthlyResult = calculateMonthlyAccrualLeave(input.monthly, policy, input.firstYearEndDate);
    return {
      grantedDays: monthlyResult.grantedDays,
      basis: {
        reasonCode: 'MONTHLY_ACCRUAL',
        monthlyResult,
        seniorityAddonDays: 0,
        cappedAt: null,
        legalReferences: ['근로기준법 제60조②', '근로기준법 제60조⑦'],
      },
    };
  }

  if (!input.fullYear) {
    throw new Error('yearsOfService>=1이면 fullYear가 필수입니다.');
  }
  const fullYearResult = calculateFullYearAnnualLeaveGrant(input.fullYear, policy);
  const seniorityAddonDays = calculateSeniorityAddonDays(input.yearsOfService, policy);
  const rawTotal = fullYearResult.grantedDays + seniorityAddonDays;
  const grantedDays = Math.min(rawTotal, policy.annualLeaveMaxCapDays);
  const cappedAt = rawTotal > policy.annualLeaveMaxCapDays ? policy.annualLeaveMaxCapDays : null;

  return {
    grantedDays,
    basis: {
      reasonCode: 'FULL_YEAR_GRANT',
      fullYearResult,
      seniorityAddonDays,
      cappedAt,
      legalReferences: ['근로기준법 제60조①', '근로기준법 제60조④', '대법원 2021.10.14. 선고 2021다227100 판결'],
    },
  };
}
