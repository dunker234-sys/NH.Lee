'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { employeesApi } from '../../../../lib/api/employeesApi';
import { overtimeApi } from '../../../../lib/api/approvalApi';
import { compensatoryLeaveApi } from '../../../../lib/api/leaveApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);
const SOURCE_CATEGORY_LABEL = {
  OVERTIME: '연장근로',
  NIGHT: '야간근로',
  HOLIDAY_WITHIN_8H: '휴일근로(8시간 이내)',
  HOLIDAY_EXCESS_8H: '휴일근로(8시간 초과)',
} as const;

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '전환에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

/** 보상휴가(compensatory_leave) 전환 — 근로자대표 서면합의(labor_agreement)
 * 도입 사업장에서, 승인된 연장/야간/휴일근로를 가산율 반영해 휴가로
 * 환산한다(용어집: compensatory_leave). */
export default function CompensatoryLeavePage() {
  const [siteId, setSiteId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [overtimeRequestId, setOvertimeRequestId] = useState('');
  const [sourceCategory, setSourceCategory] = useState<keyof typeof SOURCE_CATEGORY_LABEL>('OVERTIME');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const principalQuery = usePrincipal();
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const employeesQuery = useQuery({ queryKey: ['employees', siteId], queryFn: () => employeesApi.list(siteId), enabled: siteId !== '' });
  const approvedOvertimeQuery = useQuery({
    queryKey: ['approval', 'overtime-requests', siteId, 'APPROVED'],
    queryFn: () => overtimeApi.list({ siteId, status: 'APPROVED' }),
    enabled: siteId !== '',
  });
  const eligibleForEmployee = (approvedOvertimeQuery.data ?? []).filter((r) => r.employeeId === employeeId);

  const mutation = useMutation({
    mutationFn: () => compensatoryLeaveApi.convert({ employeeId, sourceOvertimeRequestId: overtimeRequestId, sourceCategory }),
    onSuccess: () => {
      setLastResult('보상휴가 전환이 완료됐습니다.');
      setOvertimeRequestId('');
    },
  });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 사업장·권역·본사 관리자만 볼 수 있습니다.</p>;
  }

  const canSubmit = employeeId !== '' && overtimeRequestId !== '';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">보상휴가 전환</h1>

      <form
        className="flex max-w-lg flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setLastResult(null);
          mutation.mutate();
        }}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">사업장</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={siteId}
            onChange={(e) => {
              setSiteId(e.target.value);
              setEmployeeId('');
              setOvertimeRequestId('');
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value);
              setOvertimeRequestId('');
            }}
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
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">전환 대상 승인 연장근로</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
            value={overtimeRequestId}
            onChange={(e) => setOvertimeRequestId(e.target.value)}
            disabled={employeeId === ''}
          >
            <option value="">선택하세요</option>
            {eligibleForEmployee.map((r) => (
              <option key={r.id} value={r.id}>
                {r.targetDate.slice(0, 10)} · {r.expectedMinutes}분 · {r.reason}
              </option>
            ))}
          </select>
          {employeeId !== '' && eligibleForEmployee.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">전환 가능한 승인된 연장근로 신청이 없습니다.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">근로 구분</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={sourceCategory}
            onChange={(e) => setSourceCategory(e.target.value as keyof typeof SOURCE_CATEGORY_LABEL)}
          >
            {(Object.keys(SOURCE_CATEGORY_LABEL) as (keyof typeof SOURCE_CATEGORY_LABEL)[]).map((c) => (
              <option key={c} value={c}>
                {SOURCE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          전환
        </button>
        {lastResult && !mutation.isError && (
          <p className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">{lastResult}</p>
        )}
        <ErrorMessage error={mutation.error} />
      </form>
    </div>
  );
}
