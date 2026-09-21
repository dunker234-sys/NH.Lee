import { reconcileFiscalYearVsAnniversaryOnResignation } from './fiscal-vs-anniversary-reconciliation';

describe('reconcileFiscalYearVsAnniversaryOnResignation — 퇴직 시 회계연도vs입사일 정산 비교', () => {
  it('회계연도 기준 누적발생이 입사일 기준보다 적으면 부족분만큼 추가 부여가 필요하다', () => {
    const result = reconcileFiscalYearVsAnniversaryOnResignation({
      fiscalYearBasisGrantedDaysCumulative: 20,
      anniversaryBasisGrantedDaysCumulative: 26,
    });
    expect(result.shortfallDays).toBe(6);
    expect(result.requiresAdditionalGrant).toBe(true);
  });

  it('회계연도 기준이 입사일 기준보다 많거나 같으면(근로자에게 유리) 추가 부여가 필요 없다', () => {
    const result = reconcileFiscalYearVsAnniversaryOnResignation({
      fiscalYearBasisGrantedDaysCumulative: 30,
      anniversaryBasisGrantedDaysCumulative: 26,
    });
    expect(result.shortfallDays).toBe(0);
    expect(result.requiresAdditionalGrant).toBe(false);
  });

  it('정확히 같으면 부족분 0', () => {
    const result = reconcileFiscalYearVsAnniversaryOnResignation({
      fiscalYearBasisGrantedDaysCumulative: 26,
      anniversaryBasisGrantedDaysCumulative: 26,
    });
    expect(result.shortfallDays).toBe(0);
    expect(result.requiresAdditionalGrant).toBe(false);
  });
});
