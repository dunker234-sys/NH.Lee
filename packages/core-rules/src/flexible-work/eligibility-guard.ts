import { FlexibleWorkAgreementMissingError, FlexibleWorkNotEligibleError } from '../types/errors';

export interface WorkerProfile {
  isMinor: boolean;
  isPregnant: boolean;
}

/**
 * 모든 탄력적/선택적 근로시간제 함수의 진입부에서 호출하는 공통 가드.
 * - 18세 미만/임신 중 근로자 → 오류(시나리오32)
 * - labor_agreement/work_rule 근거 없음(호출자가 조회해 boolean으로 주입) → 오류(시나리오40,
 *   "설정만으로는 활성화되지 않는다")
 */
export function assertFlexibleWorkEligible(worker: WorkerProfile, agreementInPlace: boolean): void {
  if (worker.isMinor) throw new FlexibleWorkNotEligibleError('MINOR');
  if (worker.isPregnant) throw new FlexibleWorkNotEligibleError('PREGNANT');
  if (!agreementInPlace) throw new FlexibleWorkAgreementMissingError();
}
