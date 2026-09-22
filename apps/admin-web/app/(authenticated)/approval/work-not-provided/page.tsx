'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { useEmployeeNameMap } from '../../../../lib/useEmployeeNameMap';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { employeesApi } from '../../../../lib/api/employeesApi';
import { workNotProvidedApi } from '../../../../lib/api/approvalApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function JudgmentForm({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const [employeeId, setEmployeeId] = useState('');
  const [workDate, setWorkDate] = useState('');
  const [reason, setReason] = useState('');
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);

  const employeesQuery = useQuery({ queryKey: ['employees', siteId], queryFn: () => employeesApi.list(siteId) });

  const mutation = useMutation({
    mutationFn: () => workNotProvidedApi.judge({ employeeId, workDate, reason }),
    onSuccess: () => {
      const label = employeesQuery.data?.find((e) => e.id === employeeId)?.name ?? employeeId;
      setLastSubmitted(`${label} (${workDate}) 근로 미제공 판정 저장 완료`);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['approval', 'work-not-provided', siteId] });
    },
  });

  const canSubmit = employeeId !== '' && workDate !== '' && reason.trim() !== '';

  return (
    <form
      className="flex max-w-lg flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setLastSubmitted(null);
        mutation.mutate();
      }}
    >
      <p className="text-sm text-slate-500">
        실근로 사실이 있었지만 근로 제공이 아니었다고 볼 명시적 사유가 있는 경우에만 사용합니다. 사유 없이는 저장되지 않으며, 판정 없이는
        미승인 실적이 그대로 산입됩니다(CLAUDE.md 절대 규칙2).
      </p>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">직원</label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
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
        <label className="mb-1 block text-sm font-medium text-slate-700">근로일</label>
        <input
          type="date"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={workDate}
          onChange={(e) => setWorkDate(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">판정 사유 (필수)</label>
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit || mutation.isPending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {mutation.isPending ? '저장 중...' : '판정 저장'}
      </button>
      {lastSubmitted && !mutation.isError && (
        <p className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">{lastSubmitted}</p>
      )}
      <ErrorMessage error={mutation.error} />
    </form>
  );
}

function JudgmentList({ siteId }: { siteId: string }) {
  const { nameById } = useEmployeeNameMap(siteId);
  const listQuery = useQuery({
    queryKey: ['approval', 'work-not-provided', siteId],
    queryFn: () => workNotProvidedApi.list({ siteId }),
  });

  if (listQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  if (listQuery.isError) return <p className="text-red-600">목록을 불러올 수 없습니다.</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">근로일</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사유</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">판정일시</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(listQuery.data ?? []).length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                판정 이력이 없습니다.
              </td>
            </tr>
          )}
          {listQuery.data?.map((row) => (
            <tr key={row.id}>
              <td className="px-3 py-2 text-sm text-slate-700">{nameById.get(row.employeeId) ?? row.employeeId}</td>
              <td className="px-3 py-2 text-sm text-slate-600">{row.workDate.slice(0, 10)}</td>
              <td className="px-3 py-2 text-sm text-slate-600">{row.reason}</td>
              <td className="px-3 py-2 text-sm text-slate-500">{new Date(row.judgedAt).toLocaleString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 근로 미제공 판정(work_not_provided_judgment) — CLAUDE.md 절대 규칙2의
 * 유일한 예외 경로. "관리자가 근로 미제공으로 사유와 함께 명시 판정한
 * 경우에만" 미승인 실적에서 제외된다. */
export default function WorkNotProvidedPage() {
  const [siteId, setSiteId] = useState('');
  const principalQuery = usePrincipal();
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 사업장·권역·본사 관리자만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">근로 미제공 판정</h1>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">사업장</label>
        <select
          className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
        >
          <option value="">선택하세요</option>
          {sitesQuery.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {siteId === '' ? (
        <p className="text-slate-500">사업장을 선택하세요.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <JudgmentForm siteId={siteId} />
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-700">판정 이력</h2>
            <JudgmentList siteId={siteId} />
          </div>
        </div>
      )}
    </div>
  );
}
