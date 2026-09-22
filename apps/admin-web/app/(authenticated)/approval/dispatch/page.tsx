'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { useEmployeeNameMap } from '../../../../lib/useEmployeeNameMap';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { dispatchApi, type DispatchRequest, type DispatchStatus } from '../../../../lib/api/approvalApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);

const STATUS_LABEL: Record<DispatchStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '반려',
  CANCELLED: '취소',
};
const TYPE_LABEL = { BUSINESS_TRIP: '출장', SITE_SUPPORT: '지원' } as const;

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function DispatchView({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DispatchStatus | ''>('PENDING');
  const { nameById } = useEmployeeNameMap(siteId);

  const listQuery = useQuery({
    queryKey: ['approval', 'dispatch-requests', siteId, status],
    queryFn: () => dispatchApi.list({ siteId, status: status || undefined }),
  });

  const approveMutation = useMutation({
    mutationFn: (row: DispatchRequest) => dispatchApi.approve(row.id, row.version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval', 'dispatch-requests', siteId] }),
  });
  const rejectMutation = useMutation({
    mutationFn: (row: DispatchRequest) => dispatchApi.reject(row.id, row.version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval', 'dispatch-requests', siteId] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">상태</label>
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as DispatchStatus | '')}
        >
          <option value="">전체</option>
          {(Object.keys(STATUS_LABEL) as DispatchStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {listQuery.isLoading && <p className="text-slate-500">불러오는 중...</p>}
      {listQuery.isError && <p className="text-red-600">목록을 불러올 수 없습니다.</p>}
      {listQuery.data && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">유형</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">기간</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사유</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">상태</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listQuery.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-400">
                    신청 내역이 없습니다.
                  </td>
                </tr>
              )}
              {listQuery.data.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm text-slate-700">{nameById.get(row.employeeId) ?? row.employeeId}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {TYPE_LABEL[row.dispatchType]}
                    {row.isPostHoc && <span className="ml-1 text-xs text-amber-600">(사후)</span>}
                  </td>
                  <td className="px-3 py-2 text-sm text-slate-600">
                    {row.startDate.slice(0, 10)} ~ {row.endDate.slice(0, 10)}
                  </td>
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
    </div>
  );
}

/** 외근·출장·지원(dispatch_request) 승인 — 승인 시 지오펜스 예외가
 * 적용된다(용어집). admin/approval/dispatch-requests 연동. */
export default function DispatchApprovalPage() {
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
      <h1 className="text-xl font-bold">외근·출장 승인</h1>

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

      {siteId === '' ? <p className="text-slate-500">사업장을 선택하세요.</p> : <DispatchView siteId={siteId} />}
    </div>
  );
}
