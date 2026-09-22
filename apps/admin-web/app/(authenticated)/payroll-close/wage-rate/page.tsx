'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { employeesApi } from '../../../../lib/api/employeesApi';
import { wageRateApi } from '../../../../lib/api/payrollCloseApi';

const ALLOWED_ROLES = new Set(['HQ_HR', 'ADMIN']);

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function WageRateView({ employeeId, employeeLabel }: { employeeId: string; employeeLabel: string }) {
  const queryClient = useQueryClient();
  const [wageType, setWageType] = useState<'HOURLY' | 'MONTHLY'>('MONTHLY');
  const [baseAmount, setBaseAmount] = useState('');
  const [effectiveStartDate, setEffectiveStartDate] = useState('');

  const historyQuery = useQuery({ queryKey: ['wage-rate', employeeId], queryFn: () => wageRateApi.history(employeeId) });

  const mutation = useMutation({
    mutationFn: () => wageRateApi.set(employeeId, { wageType, baseAmount: Number(baseAmount), effectiveStartDate }),
    onSuccess: () => {
      setBaseAmount('');
      setEffectiveStartDate('');
      queryClient.invalidateQueries({ queryKey: ['wage-rate', employeeId] });
    },
  });

  const canSubmit = baseAmount !== '' && Number(baseAmount) >= 0 && effectiveStartDate !== '';

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form
        className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="text-sm text-slate-500">{employeeLabel}의 새 임금요율을 등록합니다. 등록 시점부터 유효기간이 시작됩니다.</p>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">유형</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={wageType}
            onChange={(e) => setWageType(e.target.value as 'HOURLY' | 'MONTHLY')}
          >
            <option value="MONTHLY">월급</option>
            <option value="HOURLY">시급</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">금액(원)</label>
          <input
            type="number"
            min={0}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={baseAmount}
            onChange={(e) => setBaseAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">적용 시작일</label>
          <input
            type="date"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={effectiveStartDate}
            onChange={(e) => setEffectiveStartDate(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          등록
        </button>
        <ErrorMessage error={mutation.error} />
      </form>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">이력</h2>
        {historyQuery.isLoading && <p className="text-slate-500">불러오는 중...</p>}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">유형</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">금액</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">시작일</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">종료일</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(historyQuery.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                    등록된 요율이 없습니다.
                  </td>
                </tr>
              )}
              {historyQuery.data?.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-sm text-slate-600">{r.wageType === 'MONTHLY' ? '월급' : '시급'}</td>
                  <td className="px-3 py-2 text-right text-sm text-slate-600">{r.baseAmount.toLocaleString()}원</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{r.effectiveStartDate.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-sm text-slate-500">{r.effectiveEndDate ? r.effectiveEndDate.slice(0, 10) : '무기한'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** 임금요율(EmployeeWageRate) 관리 — 급여 정보라 HQ_HR/ADMIN만 접근한다
 * (백엔드 EmployeeWageRateController @Roles와 동일 기준). */
export default function WageRatePage() {
  const [siteId, setSiteId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const principalQuery = usePrincipal();
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const employeesQuery = useQuery({ queryKey: ['employees', siteId], queryFn: () => employeesApi.list(siteId), enabled: siteId !== '' });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 HQ_HR·ADMIN 권한만 볼 수 있습니다.</p>;
  }

  const selectedEmployee = employeesQuery.data?.find((e) => e.id === employeeId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">임금요율 관리</h1>

      <div className="flex items-end gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">사업장</label>
          <select
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value);
              setEmployeeId('');
            }}
          >
            <option value="">선택하세요</option>
            {sitesQuery.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">직원</label>
          <select
            className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={siteId === ''}
          >
            <option value="">선택하세요</option>
            {employeesQuery.data?.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.employeeNo})
              </option>
            ))}
          </select>
        </div>
      </div>

      {employeeId === '' ? (
        <p className="text-slate-500">직원을 선택하세요.</p>
      ) : (
        <WageRateView employeeId={employeeId} employeeLabel={selectedEmployee ? `${selectedEmployee.name} (${selectedEmployee.employeeNo})` : employeeId} />
      )}
    </div>
  );
}
