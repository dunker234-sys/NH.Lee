'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { useEmployeeNameMap } from '../../../../lib/useEmployeeNameMap';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { overtimeApi, type OvertimeRequest, type OvertimeRequestStatus } from '../../../../lib/api/approvalApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);

const STATUS_LABEL: Record<OvertimeRequestStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
};

function firstDayOfThisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function OvertimeView({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(firstDayOfThisMonth());
  const [to, setTo] = useState(today());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { nameById } = useEmployeeNameMap(siteId);

  const unapprovedQuery = useQuery({
    queryKey: ['approval', 'unapproved-actuals', siteId, from, to],
    queryFn: () => overtimeApi.unapprovedActuals(siteId, from, to),
  });
  const requestsQuery = useQuery({
    queryKey: ['approval', 'overtime-requests', siteId, from, to],
    queryFn: () => overtimeApi.list({ siteId, from, to }),
  });

  const bulkApproveMutation = useMutation({
    mutationFn: () =>
      overtimeApi.bulkApprove(
        [...selected].map((key) => {
          const [employeeId, targetDate] = key.split('|');
          return { employeeId, targetDate };
        }),
      ),
    onSuccess: () => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['approval', 'unapproved-actuals', siteId] });
      queryClient.invalidateQueries({ queryKey: ['approval', 'overtime-requests', siteId] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (row: OvertimeRequest) => overtimeApi.approve(row.id, row.version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval', 'overtime-requests', siteId] }),
  });
  const rejectMutation = useMutation({
    mutationFn: (row: OvertimeRequest) => overtimeApi.reject(row.id, row.version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval', 'overtime-requests', siteId] }),
  });

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">시작일</label>
          <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">종료일</label>
          <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">미승인 실적 (일괄 승인 대상)</h2>
          <button
            type="button"
            disabled={selected.size === 0 || bulkApproveMutation.isPending}
            onClick={() => bulkApproveMutation.mutate()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            선택 {selected.size}건 일괄 승인
          </button>
        </div>
        {unapprovedQuery.isLoading && <p className="text-slate-500">불러오는 중...</p>}
        {unapprovedQuery.isError && <p className="text-red-600">목록을 불러올 수 없습니다.</p>}
        {unapprovedQuery.data && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">근로일</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">미승인(분)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">기존 신청 상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unapprovedQuery.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                      대상이 없습니다.
                    </td>
                  </tr>
                )}
                {unapprovedQuery.data.map((row) => {
                  const key = `${row.employeeId}|${row.workDate}`;
                  const alreadyApproved = row.existingRequestStatus === 'APPROVED';
                  return (
                    <tr key={key}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          disabled={alreadyApproved}
                          checked={selected.has(key)}
                          onChange={() => toggle(key)}
                        />
                      </td>
                      <td className="px-3 py-2 text-sm text-slate-700">{row.employeeName}</td>
                      <td className="px-3 py-2 text-sm text-slate-600">{row.workDate}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-600">{row.unapprovedOvertimeMinutes.toLocaleString()}</td>
                      <td className="px-3 py-2 text-sm text-slate-500">
                        {row.existingRequestStatus ? STATUS_LABEL[row.existingRequestStatus] : '신청 없음'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <ErrorMessage error={bulkApproveMutation.error} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">연장근로 신청 목록</h2>
        {requestsQuery.isLoading && <p className="text-slate-500">불러오는 중...</p>}
        {requestsQuery.isError && <p className="text-red-600">목록을 불러올 수 없습니다.</p>}
        {requestsQuery.data && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">유형</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">대상일</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">예상(분)</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사유</th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">상태</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">처리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requestsQuery.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">
                      신청 내역이 없습니다.
                    </td>
                  </tr>
                )}
                {requestsQuery.data.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-sm text-slate-700">{nameById.get(row.employeeId) ?? row.employeeId}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{row.requestType === 'PRE' ? '사전' : '사후'}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{row.targetDate.slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right text-sm text-slate-600">{row.expectedMinutes.toLocaleString()}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{row.reason}</td>
                    <td className="px-3 py-2 text-sm text-slate-600">{STATUS_LABEL[row.status]}</td>
                    <td className="px-3 py-2 text-right">
                      {row.status === 'PENDING' && (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(row)}
                            className="rounded-lg bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            승인
                          </button>
                          <button
                            type="button"
                            disabled={rejectMutation.isPending}
                            onClick={() => rejectMutation.mutate(row)}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                          >
                            반려
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorMessage error={approveMutation.error} />
        <ErrorMessage error={rejectMutation.error} />
      </section>
    </div>
  );
}

/** CLAUDE.md 절대 규칙2(미승인 실적 전량 산입, 관리자 승인은 성립요건이
 * 아니다) 운영 화면 — admin/approval/overtime-requests 3개 엔드포인트를
 * 하나로 묶는다. */
export default function OvertimeApprovalPage() {
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
      <h1 className="text-xl font-bold">연장근로 승인</h1>

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

      {siteId === '' ? <p className="text-slate-500">사업장을 선택하세요.</p> : <OvertimeView siteId={siteId} />}
    </div>
  );
}
