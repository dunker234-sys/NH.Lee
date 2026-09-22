'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { nightWorkHealthCheckupApi } from '../../../../lib/api/complianceReportsApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

/** 야간작업 특수건강진단(산안법 §130, 시행규칙 별표22 제4호) — 근기법
 * 야간(22~06시)과 판정 시간대가 다르다(용어집 마지막 항목). 사전 계산된
 * 결과만 조회하고, 재계산은 배치로 트리거한다. */
export default function NightWorkHealthCheckupPage() {
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState('');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const principalQuery = usePrincipal();
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const listQuery = useQuery({
    queryKey: ['night-work-health-checkup', siteId],
    queryFn: () => nightWorkHealthCheckupApi.list(siteId || undefined),
  });

  const recalcMutation = useMutation({
    mutationFn: () => nightWorkHealthCheckupApi.recalculate(asOfDate, siteId || undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['night-work-health-checkup'] }),
  });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 사업장·권역·본사 관리자만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">야간작업 특수건강진단 대상자</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">사업장</label>
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">전체</option>
            {sitesQuery.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">기준일</label>
          <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        </div>
        <button
          type="button"
          disabled={recalcMutation.isPending}
          onClick={() => recalcMutation.mutate()}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          재계산 실행
        </button>
      </div>
      <ErrorMessage error={recalcMutation.error} />
      {recalcMutation.isSuccess && <p className="text-sm text-green-700">재계산을 실행했습니다.</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사업장</th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-slate-500">기준1 (횟수)</th>
              <th className="px-3 py-2 text-center text-xs font-medium uppercase text-slate-500">기준2 (누적시간)</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">산정 기준일</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(listQuery.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                  대상자가 없습니다.
                </td>
              </tr>
            )}
            {listQuery.data?.map((r) => (
              <tr key={r.employeeId}>
                <td className="px-3 py-2 text-sm text-slate-700">
                  {r.employeeName} ({r.employeeNo})
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.siteName}</td>
                <td className={`px-3 py-2 text-center text-sm ${r.criterion1Met ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                  {r.criterion1Count}회{r.criterion1Met && ' (해당)'}
                </td>
                <td className={`px-3 py-2 text-center text-sm ${r.criterion2Met ? 'font-semibold text-red-600' : 'text-slate-500'}`}>
                  {r.criterion2TotalMinutes.toLocaleString()}분{r.criterion2Met && ' (해당)'}
                </td>
                <td className="px-3 py-2 text-sm text-slate-500">{r.windowEndDate.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
