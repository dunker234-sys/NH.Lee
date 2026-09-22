'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { usePrincipal } from '../../../lib/usePrincipal';
import { sitesApi } from '../../../lib/api/sitesApi';
import { auditLogApi } from '../../../lib/api/auditApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);
const INTEGRITY_ROLES = new Set(['HQ_HR', 'ADMIN']);

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '조회에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function IntegritySection({ from, to }: { from: string; to: string }) {
  const checkMutation = useMutation({ mutationFn: () => auditLogApi.integrityCheck(from, to) });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">무결성 검증(해시체인 + Merkle 봉인)</h2>
        <button
          type="button"
          disabled={checkMutation.isPending}
          onClick={() => checkMutation.mutate()}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40"
        >
          현재 필터 기간으로 검증
        </button>
      </div>
      {checkMutation.data && (
        <pre className={`overflow-x-auto rounded-lg border p-3 text-xs ${checkMutation.data.ok ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'}`}>
          {JSON.stringify(checkMutation.data, null, 2)}
        </pre>
      )}
      <ErrorMessage error={checkMutation.error} />
    </section>
  );
}

/** 감사 로그(audit_log) 조회 — 상태 변경 이벤트만 기록되며 해시체인 +
 * 시간 단위 Merkle 루트로 보호된다(용어집). STEP12 위치정보 파기 배치가
 * 정상 실행됐는지(PUNCH_LOCATION_PURGED 이벤트) 확인하는 유일한 경로이기도
 * 하다(INCIDENT_RUNBOOK.md §2 참고). */
export default function AuditLogPage() {
  const [siteId, setSiteId] = useState('');
  const [eventType, setEventType] = useState('');
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(todayIso());
  const principalQuery = usePrincipal();
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  const listQuery = useQuery({
    queryKey: ['audit-log', siteId, eventType, from, to],
    queryFn: () => auditLogApi.list({ from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z`, siteId: siteId || undefined, eventType: eventType || undefined }),
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const blob = await auditLogApi.export({ from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z`, siteId: siteId || undefined, eventType: eventType || undefined });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 사업장·권역·본사 관리자만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">감사 로그</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">시작일</label>
          <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">종료일</label>
          <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">사업장</label>
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">전체(본사 권한만)</option>
            {sitesQuery.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">이벤트 유형(선택)</label>
          <input
            placeholder="예: PUNCH_LOCATION_PURGED"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 disabled:opacity-40"
        >
          엑셀 내보내기
        </button>
      </div>
      <ErrorMessage error={listQuery.error} />
      <ErrorMessage error={exportMutation.error} />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">발생일시</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">이벤트</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">행위자</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">리소스</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사유</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(listQuery.data ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                  해당 조건의 로그가 없습니다.
                </td>
              </tr>
            )}
            {listQuery.data?.map((r) => (
              <tr key={r.seq}>
                <td className="px-3 py-2 text-sm text-slate-600">{new Date(r.occurredAt).toLocaleString('ko-KR')}</td>
                <td className="px-3 py-2 text-sm font-medium text-slate-700">{r.eventType}</td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {r.actorPrincipal} ({r.actorRole})
                </td>
                <td className="px-3 py-2 text-sm text-slate-600">
                  {r.resourceType}
                  {r.resourceId ? ` #${r.resourceId.slice(0, 8)}` : ''}
                </td>
                <td className="max-w-xs px-3 py-2 text-sm text-slate-500">{r.reason ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {INTEGRITY_ROLES.has(role) && <IntegritySection from={`${from}T00:00:00.000Z`} to={`${to}T23:59:59.999Z`} />}
    </div>
  );
}
