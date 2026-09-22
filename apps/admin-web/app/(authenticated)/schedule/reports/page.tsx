'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { scheduleApi } from '../../../../lib/api/scheduleApi';
import { currentYearMonth } from '../../../../lib/schedule/dateUtil';

export default function ScheduleReportsPage() {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());

  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const activeSiteId = siteId ?? sitesQuery.data?.items[0]?.id ?? null;

  const reportQuery = useQuery({
    queryKey: ['schedule', 'report', activeSiteId, yearMonth],
    queryFn: () => scheduleApi.scheduleVsActual(activeSiteId!, yearMonth),
    enabled: Boolean(activeSiteId),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">근무스케쥴(실적)</h1>
        <select value={activeSiteId ?? ''} onChange={(e) => setSiteId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {sitesQuery.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input type="month" value={yearMonth} onChange={(e) => setYearMonth(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
      </div>

      {reportQuery.isLoading && <p className="text-slate-500">불러오는 중...</p>}

      {reportQuery.data && (
        <table className="border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="pr-4">직원</th>
              <th className="pr-4">근무일</th>
              <th className="pr-4">상태</th>
              <th className="pr-4">지각</th>
              <th className="pr-4">조퇴</th>
              <th className="pr-4">미출근</th>
              <th className="pr-4">초과</th>
            </tr>
          </thead>
          <tbody>
            {reportQuery.data.map((row) => (
              <tr key={row.scheduleId} className={`rounded-lg ${row.isAbsence ? 'bg-red-50' : 'bg-white'}`}>
                <td className="pr-4 py-1">
                  {row.employeeName} <span className="text-xs text-slate-400">({row.employeeNo})</span>
                </td>
                <td className="pr-4 py-1">{row.workDate}</td>
                <td className="pr-4 py-1">{row.status}</td>
                <td className="pr-4 py-1">{row.latenessMinutes != null ? `${row.latenessMinutes}분` : row.actualExists ? '-' : '미확인'}</td>
                <td className="pr-4 py-1">{row.earlyLeaveMinutes != null ? `${row.earlyLeaveMinutes}분` : row.actualExists ? '-' : '미확인'}</td>
                <td className="pr-4 py-1">{row.isAbsence == null ? '미확인' : row.isAbsence ? '결근' : '-'}</td>
                <td className="pr-4 py-1">{row.scheduledExcessMinutes != null ? `${row.scheduledExcessMinutes}분` : row.actualExists ? '-' : '미확인'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
