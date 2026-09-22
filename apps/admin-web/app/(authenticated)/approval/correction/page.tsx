'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { useEmployeeNameMap } from '../../../../lib/useEmployeeNameMap';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { correctionApi, type CorrectionRequest, type CorrectionStatus, type CorrectionReasonCode } from '../../../../lib/api/correctionApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);

const STATUS_LABEL: Record<CorrectionStatus, string> = {
  PENDING: '대기',
  APPROVED_L1: '1차 승인',
  APPROVED_L2: '최종 승인',
  REJECTED: '반려',
};
const REASON_LABEL: Record<CorrectionReasonCode, string> = {
  PUNCH_MISSING: '타각 누락',
  DEVICE_ERROR: '기기 오류',
  NETWORK_FAILURE: '통신 장애',
  DISPATCH: '외근',
  LOCATION_ERROR: '위치 오차',
  SCHEDULE_CHANGE: '스케줄 변경',
  BREAK_NOT_GRANTED: '휴게 미부여 신고',
  OTHER: '기타',
};
const ACTIONABLE_STATUSES: CorrectionStatus[] = ['PENDING', 'APPROVED_L1'];

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function CorrectionView({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<CorrectionStatus | ''>('PENDING');
  const { nameById } = useEmployeeNameMap(siteId);

  const listQuery = useQuery({
    queryKey: ['approval', 'correction-requests', siteId, status],
    queryFn: () => correctionApi.list({ siteId, status: status || undefined }),
  });

  const approveMutation = useMutation({
    mutationFn: (row: CorrectionRequest) => correctionApi.approve(row.id, row.version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval', 'correction-requests', siteId] }),
  });
  const rejectMutation = useMutation({
    mutationFn: (row: CorrectionRequest) => correctionApi.reject(row.id, row.version),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['approval', 'correction-requests', siteId] }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">상태</label>
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as CorrectionStatus | '')}
        >
          <option value="">전체</option>
          {(Object.keys(STATUS_LABEL) as CorrectionStatus[]).map((s) => (
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
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">대상일</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사유코드</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">상세 사유</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">신청 출처</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">상태</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">처리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {listQuery.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">
                    신청 내역이 없습니다.
                  </td>
                </tr>
              )}
              {listQuery.data.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-sm text-slate-700">{nameById.get(row.employeeId) ?? row.employeeId}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{row.targetWorkDate.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{REASON_LABEL[row.reasonCode]}</td>
                  <td className="max-w-xs px-3 py-2 text-sm text-slate-600">{row.reasonDetail}</td>
                  <td className="px-3 py-2 text-sm text-slate-500">{row.requestSource === 'EMPLOYEE' ? '근로자' : '관리자 직권'}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{STATUS_LABEL[row.status]}</td>
                  <td className="px-3 py-2 text-right">
                    {ACTIONABLE_STATUSES.includes(row.status) && (
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

/** 정정신청(correction_request) 승인 — 2단계 승인(PENDING→APPROVED_L1→
 * APPROVED_L2)은 백엔드가 호출자 역할로 자동 판정하므로 화면은 동일한
 * 승인 버튼만 노출한다(correctionApi.ts 주석 참고). */
export default function CorrectionApprovalPage() {
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
      <h1 className="text-xl font-bold">정정신청 승인</h1>

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

      {siteId === '' ? <p className="text-slate-500">사업장을 선택하세요.</p> : <CorrectionView siteId={siteId} />}
    </div>
  );
}
