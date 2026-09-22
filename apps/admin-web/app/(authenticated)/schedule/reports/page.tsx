'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { scheduleApi, type ActualReportDayRow, type ActualReportEmployeeRow } from '../../../../lib/api/scheduleApi';
import { payrollCloseApi } from '../../../../lib/api/payrollCloseApi';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { currentYearMonth } from '../../../../lib/schedule/dateUtil';

function fmtMin(n: number | null): string {
  return n == null ? '-' : `${n}분`;
}

function fmtMoney(n: number | null): string {
  return n == null ? '-' : `${n.toLocaleString('ko-KR')}원`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function EmployeeReportCard({
  row,
  siteId,
  canEdit,
  onEdit,
}: {
  row: ActualReportEmployeeRow;
  siteId: string;
  canEdit: boolean;
  onEdit: (day: ActualReportDayRow) => void;
}) {
  return (
    <div className="break-inside-avoid rounded-xl border border-slate-200 bg-white p-5 print:break-after-page print:rounded-none print:border-none print:p-0">
      <h2 className="text-lg font-bold">
        {row.employeeName} <span className="text-sm font-normal text-slate-400">({row.employeeNo})</span>
      </h2>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] border-separate border-spacing-y-1 text-xs">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="pr-3">근무일</th>
              <th className="pr-3">계획</th>
              <th className="pr-3">실적(분)</th>
              <th className="pr-3">지각</th>
              <th className="pr-3">조퇴</th>
              <th className="pr-3">결근</th>
              <th className="pr-3">연장(승인/미승인)</th>
              <th className="pr-3">야간</th>
              <th className="pr-3">휴일(정상/초과)</th>
              <th className="pr-3">6일차</th>
              <th className="pr-3">일급</th>
              {canEdit && <th className="pr-3 print:hidden">수정</th>}
            </tr>
          </thead>
          <tbody>
            {row.days.map((d) => (
              <tr key={d.workDate} className={d.isAbsence ? 'bg-red-50' : 'bg-white'}>
                <td className="pr-3 py-1">{d.workDate}</td>
                <td className="pr-3 py-1">
                  {fmtTime(d.plannedStartAt)}~{fmtTime(d.plannedEndAt)}
                </td>
                <td className="pr-3 py-1">{fmtMin(d.actualWorkMinutes)}</td>
                <td className="pr-3 py-1">{fmtMin(d.latenessMinutes)}</td>
                <td className="pr-3 py-1">{fmtMin(d.earlyLeaveMinutes)}</td>
                <td className="pr-3 py-1">{d.isAbsence == null ? '-' : d.isAbsence ? '결근' : '-'}</td>
                <td className="pr-3 py-1">
                  {fmtMin(d.approvedOvertimeMinutes)}/{fmtMin(d.unapprovedOvertimeMinutes)}
                </td>
                <td className="pr-3 py-1">{fmtMin(d.nightWorkMinutes)}</td>
                <td className="pr-3 py-1">
                  {fmtMin(d.holidayWorkMinutesNormal)}/{fmtMin(d.holidayWorkMinutesExcess)}
                </td>
                <td className="pr-3 py-1">{d.consecutiveDayNumber != null && d.consecutiveDayNumber >= 6 ? `${d.consecutiveDayNumber}일차` : '-'}</td>
                <td className="pr-3 py-1 font-medium">{fmtMoney(d.dailyWageAmount)}</td>
                {canEdit && (
                  <td className="pr-3 py-1 print:hidden">
                    <button
                      type="button"
                      onClick={() => onEdit(d)}
                      className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      수정
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {row.weeklySummaries.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-500">주휴 요약</p>
          <table className="mt-1 text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="pr-3">주 시작일</th>
                <th className="pr-3">대상 여부</th>
                <th className="pr-3">분</th>
                <th className="pr-3">주휴수당</th>
              </tr>
            </thead>
            <tbody>
              {row.weeklySummaries.map((w) => (
                <tr key={w.weekStartDate}>
                  <td className="pr-3 py-0.5">{w.weekStartDate}</td>
                  <td className="pr-3 py-0.5">{w.weeklyPaidRestEligible ? '대상' : '-'}</td>
                  <td className="pr-3 py-0.5">{fmtMin(w.weeklyPaidRestMinutes)}</td>
                  <td className="pr-3 py-0.5">{fmtMoney(w.weeklyPaidRestPayAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
        <span>실근로 {fmtMin(row.monthTotal.actualWorkMinutes)}</span>
        <span>
          연장(승인/미승인) {fmtMin(row.monthTotal.approvedOvertimeMinutes)}/{fmtMin(row.monthTotal.unapprovedOvertimeMinutes)}
        </span>
        <span>
          휴일(정상/초과) {fmtMin(row.monthTotal.holidayWorkMinutesNormal)}/{fmtMin(row.monthTotal.holidayWorkMinutesExcess)}
        </span>
        <span>주휴수당 합계 {fmtMoney(row.monthTotal.weeklyPaidRestPayAmount)}</span>
        <span className="font-bold text-slate-900">월 합계 임금 {fmtMoney(row.monthTotal.totalWageAmount)}</span>
      </div>

      <div className="mt-6 hidden print:block">
        <p className="text-sm">위 근태·임금 내역을 확인했습니다.</p>
        <p className="mt-8 text-sm">근로자 서명: ________________________</p>
      </div>
    </div>
  );
}

export default function ScheduleReportsPage() {
  const router = useRouter();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());

  const principalQuery = usePrincipal();
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const activeSiteId = siteId ?? sitesQuery.data?.items[0]?.id ?? null;
  const activeSiteName = sitesQuery.data?.items.find((s) => s.id === activeSiteId)?.name ?? '';

  const reportQuery = useQuery({
    queryKey: ['schedule', 'actual-report', activeSiteId, yearMonth],
    queryFn: () => scheduleApi.actualReport(activeSiteId!, yearMonth),
    enabled: Boolean(activeSiteId),
  });

  const payrollCloseQuery = useQuery({
    queryKey: ['payroll-close', activeSiteId, yearMonth],
    queryFn: () => payrollCloseApi.get(activeSiteId!, yearMonth),
    enabled: Boolean(activeSiteId),
    retry: false,
  });

  const role = principalQuery.data?.principal.role;
  const canEdit = role === 'ADMIN';
  const isClosed = payrollCloseQuery.data?.status === 'CLOSED' || payrollCloseQuery.data?.status === 'RECLOSED';
  const payrollCloseMissing = payrollCloseQuery.error instanceof ApiError && payrollCloseQuery.error.status === 404;

  function handleEdit(employeeId: string, day: ActualReportDayRow) {
    if (!activeSiteId) return;
    const params = new URLSearchParams({ siteId: activeSiteId, employeeId, targetWorkDate: day.workDate });
    router.push(`/correction/admin-direct?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-xl font-bold">근무스케쥴(실적)</h1>
        <select value={activeSiteId ?? ''} onChange={(e) => setSiteId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {sitesQuery.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
        {isClosed ? (
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-semibold text-slate-700">
            인쇄
          </button>
        ) : (
          <span className="text-xs text-slate-400">
            {payrollCloseMissing ? '급여 마감 전이라 인쇄할 수 없습니다.' : payrollCloseQuery.isLoading ? '' : '급여 마감 후 인쇄할 수 있습니다.'}
          </span>
        )}
      </div>

      <p className="hidden text-lg font-bold print:block">
        {activeSiteName} · {yearMonth} 근무스케쥴(실적)
      </p>

      {reportQuery.isLoading && <p className="text-slate-500 print:hidden">불러오는 중...</p>}
      {reportQuery.data?.length === 0 && <p className="text-slate-500 print:hidden">해당 월에 표시할 근무 기록이 없습니다.</p>}

      <div className="flex flex-col gap-6">
        {reportQuery.data?.map((row) => (
          <EmployeeReportCard key={row.employeeId} row={row} siteId={activeSiteId ?? ''} canEdit={canEdit} onEdit={(day) => handleEdit(row.employeeId, day)} />
        ))}
      </div>
    </div>
  );
}
