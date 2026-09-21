'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { migrationApi } from '../../../lib/api/migrationApi';
import { sitesApi } from '../../../lib/api/sitesApi';
import { MigrationUploadPanel } from './MigrationUploadPanel';

function apiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const body = e.body as { message?: unknown } | null;
    return String(body?.message ?? fallback);
  }
  return '서버에 연결할 수 없습니다.';
}

/** STEP7.5 — 개시 데이터 이관. 기준일 설정 → 워크북 업로드(dry-run→반영)
 * → 근로자 단위 대사 리포트 → 개통 승인(차이가 0이 아니면 버튼 비활성화). */
export default function MigrationPage() {
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [cutoverDateInput, setCutoverDateInput] = useState('');
  const [banner, setBanner] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const activeSiteId = siteId ?? sitesQuery.data?.items[0]?.id ?? null;

  const cutoverQuery = useQuery({
    queryKey: ['migration', 'cutover', activeSiteId],
    queryFn: () => migrationApi.getCutover(activeSiteId!),
    enabled: Boolean(activeSiteId),
  });

  const readinessQuery = useQuery({
    queryKey: ['migration', 'readiness', activeSiteId],
    queryFn: () => migrationApi.readiness(activeSiteId!),
    enabled: Boolean(activeSiteId) && Boolean(cutoverQuery.data),
  });

  function refetchAll() {
    void queryClient.invalidateQueries({ queryKey: ['migration', 'cutover', activeSiteId] });
    void queryClient.invalidateQueries({ queryKey: ['migration', 'readiness', activeSiteId] });
  }

  const setCutoverMutation = useMutation({
    mutationFn: () => migrationApi.setCutoverDate(activeSiteId!, cutoverDateInput),
    onSuccess: () => {
      setBanner({ tone: 'success', text: '개통 기준일을 설정했습니다.' });
      refetchAll();
    },
    onError: (e) => setBanner({ tone: 'error', text: apiErrorMessage(e, '기준일 설정에 실패했습니다.') }),
  });

  const approveMutation = useMutation({
    mutationFn: () => migrationApi.approve(activeSiteId!),
    onSuccess: () => {
      setBanner({ tone: 'success', text: '개통을 승인했습니다.' });
      refetchAll();
    },
    onError: (e) => setBanner({ tone: 'error', text: apiErrorMessage(e, '개통 승인에 실패했습니다.') }),
  });

  const cutover = cutoverQuery.data ?? null;
  const readiness = readinessQuery.data ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">개시 데이터 이관</h1>
        <select
          value={activeSiteId ?? ''}
          onChange={(e) => setSiteId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
        >
          {sitesQuery.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {banner && (
        <p className={`rounded-lg border p-3 text-sm ${banner.tone === 'error' ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-700'}`}>
          {banner.text}
        </p>
      )}

      {activeSiteId && !cutoverQuery.isLoading && !cutover && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold">개통 기준일 설정</h3>
          <div className="flex items-center gap-3">
            <input
              type="date"
              value={cutoverDateInput}
              onChange={(e) => setCutoverDateInput(e.target.value)}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              disabled={!cutoverDateInput || setCutoverMutation.isPending}
              onClick={() => setCutoverMutation.mutate()}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              설정
            </button>
          </div>
        </div>
      )}

      {activeSiteId && cutover && (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
            <p>
              개통 기준일: <span className="font-semibold">{cutover.cutoverDate}</span> · 상태:{' '}
              <span className={`font-semibold ${cutover.status === 'APPROVED' ? 'text-green-700' : 'text-amber-700'}`}>
                {cutover.status === 'APPROVED' ? '개통 완료' : '승인 대기'}
              </span>
            </p>
          </div>

          {cutover.status === 'PENDING' && <MigrationUploadPanel siteId={activeSiteId} onCommitted={refetchAll} />}

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold">근로자 단위 대사 리포트</h3>
            {readiness ? (
              <>
                <p className="mb-2 text-sm">
                  총 대사 {readiness.totalRecords}건 중 불일치 <span className="font-semibold text-red-600">{readiness.unresolvedCount}</span>건
                </p>
                {readiness.mismatches.length > 0 && (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-1">사번</th>
                        <th className="py-1">성명</th>
                        <th className="py-1">항목</th>
                        <th className="py-1">수기값</th>
                        <th className="py-1">이관값</th>
                        <th className="py-1">차이</th>
                      </tr>
                    </thead>
                    <tbody>
                      {readiness.mismatches.map((m) => (
                        <tr key={m.id} className="border-b border-slate-100">
                          <td className="py-1">{m.employee.employeeNo}</td>
                          <td className="py-1">{m.employee.name}</td>
                          <td className="py-1">{m.metric}</td>
                          <td className="py-1">{m.manualValue}</td>
                          <td className="py-1">{m.migratedValue}</td>
                          <td className="py-1 font-semibold text-red-600">{m.diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              <p className="text-slate-500">워크북을 반영하면 대사 리포트가 생성됩니다.</p>
            )}
          </div>

          <div>
            <button
              type="button"
              disabled={cutover.status === 'APPROVED' || !readiness?.ready || approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
              title={!readiness?.ready ? '근로자 단위 대사 차이가 0이 될 때까지 개통을 승인할 수 없습니다.' : undefined}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {cutover.status === 'APPROVED' ? '개통 승인 완료' : '개통 승인'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
