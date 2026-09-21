import { PrismaService } from '../../common/prisma/prisma.service';
import { yearMonthOf } from '../../common/time/week.util';
import { CorrectionTargetPeriodClosedError } from './errors/correction-errors';

/**
 * 정정 신청(submit)과 승인(approve) 둘 다에서 같은 검사를 한다 — 신청 시점엔
 * 열려 있다가 승인 시점 사이에 마감이 걸릴 수 있어 승인 직전에도 재확인해야
 * 한다. 재계산은 RecalculationTriggerService가 큐에 올리는 비동기 작업이라
 * PayrollPeriodClosedError가 이 호출 스택으로 동기 전파되지 않으므로, 여기서
 * 승인 자체를 막아 사용자에게 즉시(동기) 알려준다.
 */
export async function assertCorrectionTargetPeriodOpen(
  prisma: PrismaService,
  siteId: string,
  targetWorkDate: string,
): Promise<void> {
  const periodYearMonth = yearMonthOf(targetWorkDate);
  const close = await prisma.payrollClose.findUnique({
    where: { siteId_periodYearMonth: { siteId, periodYearMonth } },
  });
  if (close && close.status !== 'OPEN') {
    throw new CorrectionTargetPeriodClosedError(siteId, periodYearMonth);
  }
}
