'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { usePrincipal } from '../../../lib/usePrincipal';
import { hrSyncApi, type HrSyncBatch, type HrSyncBatchStatus } from '../../../lib/api/hrSyncApi';

const ALLOWED_ROLES = new Set(['HQ_HR', 'ADMIN']);
const STATUS_LABEL: Record<HrSyncBatchStatus, string> = {
  PENDING_REVIEW: '검토 대기',
  AUTO_APPLIED: '자동 반영',
  APPLIED: '반영 완료',
  REJECTED: '기각',
};

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function BatchDetail({ batchId, onClose }: { batchId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['hr-sync', 'batch', batchId], queryFn: () => hrSyncApi.getBatch(batchId) });

  const approveMutation = useMutation({
    mutationFn: () => hrSyncApi.approve(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-sync', 'batches'] });
      queryClient.invalidateQueries({ queryKey: ['hr-sync', 'batch', batchId] });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: () => hrSyncApi.reject(batchId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hr-sync', 'batches'] });
      queryClient.invalidateQueries({ queryKey: ['hr-sync', 'batch', batchId] });
    },
  });

  if (query.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  if (!query.data) return null;
  const batch = query.data;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">배치 상세 — {STATUS_LABEL[batch.status]}</h2>
        <button type="button" onClick={onClose} className="text-sm text-slate-500 underline">
          닫기
        </button>
      </div>
      <p className="mb-3 text-sm text-slate-600">
        총 {batch.totalCount}건 · 신규 {batch.newCount} · 변경 {batch.changedCount} · 퇴사 {batch.departedCount} · 오류 {batch.errorCount} · 변경률{' '}
        {(Number(batch.changeRatio) * 100).toFixed(1)}%
      </p>
      {batch.status === 'PENDING_REVIEW' && (
        <div className="mb-3 flex gap-2">
          <button
            type="button"
            disabled={approveMutation.isPending}
            onClick={() => approveMutation.mutate()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            승인 및 반영
          </button>
          <button
            type="button"
            disabled={rejectMutation.isPending}
            onClick={() => rejectMutation.mutate()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40"
          >
            기각
          </button>
        </div>
      )}
      <ErrorMessage error={approveMutation.error} />
      <ErrorMessage error={rejectMutation.error} />

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사번</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">변경유형</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">오류</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batch.rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-sm text-slate-700">{r.employeeNo}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{r.changeType}</td>
                <td className="px-3 py-2 text-sm text-red-600">{r.errorMessage ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** STEP10 인사연동 배치 관리 — dry-run(미저장 미리보기)과 run(실제 적재)을
 * 구분하고, changeRatio 임계 초과로 PENDING_REVIEW에 걸린 배치를 승인/기각한다. */
export default function HrSyncPage() {
  const queryClient = useQueryClient();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [dryRunResult, setDryRunResult] = useState<HrSyncBatch | null>(null);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);

  const principalQuery = usePrincipal();
  const batchesQuery = useQuery({ queryKey: ['hr-sync', 'batches'], queryFn: () => hrSyncApi.listBatches() });

  const dryRunMutation = useMutation({ mutationFn: () => hrSyncApi.dryRun(asOfDate), onSuccess: (data) => setDryRunResult(data) });
  const runMutation = useMutation({
    mutationFn: () => hrSyncApi.run(asOfDate),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['hr-sync', 'batches'] }),
  });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 HQ_HR·ADMIN 권한만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">인사연동</h1>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">기준일</label>
            <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <button
            type="button"
            disabled={dryRunMutation.isPending}
            onClick={() => {
              setDryRunResult(null);
              dryRunMutation.mutate();
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40"
          >
            미리보기(dry-run)
          </button>
          <button
            type="button"
            disabled={runMutation.isPending}
            onClick={() => runMutation.mutate()}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            실행
          </button>
        </div>
        <ErrorMessage error={dryRunMutation.error} />
        <ErrorMessage error={runMutation.error} />
        {runMutation.isSuccess && <p className="mt-2 text-sm text-green-700">배치를 큐에 적재했습니다. 아래 이력에서 진행 상태를 확인하세요.</p>}
        {dryRunResult && (
          <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            미리보기 결과 — 총 {dryRunResult.totalCount}건 · 신규 {dryRunResult.newCount} · 변경 {dryRunResult.changedCount} · 퇴사{' '}
            {dryRunResult.departedCount} · 오류 {dryRunResult.errorCount}(저장되지 않음)
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">배치 이력</h2>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">생성일시</th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">상태</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">총건수</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">오류</th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(batchesQuery.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                    배치 이력이 없습니다.
                  </td>
                </tr>
              )}
              {batchesQuery.data?.map((b) => (
                <tr key={b.id}>
                  <td className="px-3 py-2 text-sm text-slate-600">{new Date(b.createdAt).toLocaleString('ko-KR')}</td>
                  <td className="px-3 py-2 text-sm text-slate-600">{STATUS_LABEL[b.status]}</td>
                  <td className="px-3 py-2 text-right text-sm text-slate-600">{b.totalCount}</td>
                  <td className="px-3 py-2 text-right text-sm text-red-600">{b.errorCount}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => setSelectedBatchId(b.id)} className="text-sm text-blue-600 underline">
                      상세
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedBatchId && <BatchDetail batchId={selectedBatchId} onClose={() => setSelectedBatchId(null)} />}
    </div>
  );
}
