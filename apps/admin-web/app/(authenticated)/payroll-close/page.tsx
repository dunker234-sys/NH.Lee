'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { usePrincipal } from '../../../lib/usePrincipal';
import { sitesApi } from '../../../lib/api/sitesApi';
import { payrollCloseApi, type PayrollCloseStage } from '../../../lib/api/payrollCloseApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);

const STAGE_LABEL: Record<PayrollCloseStage, string> = {
  NOT_STARTED: '시작 전',
  SITE_SUBMITTED: '사업장 제출',
  REGION_APPROVED: '권역 승인',
  HQ_FINALIZED: '본사 확정',
};

function thisYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function PayrollCloseView({ siteId, yearMonth }: { siteId: string; yearMonth: string }) {
  const queryClient = useQueryClient();
  const [reopenReason, setReopenReason] = useState('');
  const [exportFormat, setExportFormat] = useState<'EXCEL' | 'CSV'>('EXCEL');

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['payroll-close', siteId, yearMonth] });
  }

  const readinessQuery = useQuery({
    queryKey: ['payroll-close', siteId, yearMonth, 'readiness'],
    queryFn: () => payrollCloseApi.readiness(siteId, yearMonth),
  });
  const closeQuery = useQuery({
    queryKey: ['payroll-close', siteId, yearMonth, 'get'],
    queryFn: () => payrollCloseApi.get(siteId, yearMonth),
    retry: false,
  });
  const validationQuery = useQuery({
    queryKey: ['payroll-close', siteId, yearMonth, 'validation'],
    queryFn: () => payrollCloseApi.latestValidation(siteId, yearMonth),
  });
  const statementQuery = useQuery({
    queryKey: ['payroll-close', siteId, yearMonth, 'statement'],
    queryFn: () => payrollCloseApi.listStatement(siteId, yearMonth),
    enabled: Boolean(closeQuery.data),
  });
  const exportHistoryQuery = useQuery({
    queryKey: ['payroll-close', siteId, yearMonth, 'export-history'],
    queryFn: () => payrollCloseApi.exportHistory(siteId, yearMonth),
    enabled: Boolean(closeQuery.data),
  });

  const submitMutation = useMutation({ mutationFn: () => payrollCloseApi.submit(siteId, yearMonth), onSuccess: invalidateAll });
  const approveMutation = useMutation({ mutationFn: () => payrollCloseApi.approve(siteId, yearMonth), onSuccess: invalidateAll });
  const finalizeMutation = useMutation({ mutationFn: () => payrollCloseApi.finalize(siteId, yearMonth), onSuccess: invalidateAll });
  const reopenMutation = useMutation({
    mutationFn: () => payrollCloseApi.reopen(siteId, yearMonth, reopenReason),
    onSuccess: () => {
      setReopenReason('');
      invalidateAll();
    },
  });
  const runValidationMutation = useMutation({
    mutationFn: () => payrollCloseApi.runValidation(siteId, yearMonth),
    onSuccess: invalidateAll,
  });
  const acknowledgeMutation = useMutation({
    mutationFn: (reportId: string) => payrollCloseApi.acknowledgeValidation(siteId, yearMonth, reportId),
    onSuccess: invalidateAll,
  });
  const computeMutation = useMutation({
    mutationFn: () => payrollCloseApi.computeStatement(siteId, yearMonth),
    onSuccess: invalidateAll,
  });
  const exportMutation = useMutation({
    mutationFn: async () => {
      const blob = await payrollCloseApi.export(siteId, yearMonth, exportFormat);
      downloadBlob(blob, `급여명세_${siteId}_${yearMonth}.${exportFormat === 'EXCEL' ? 'xlsx' : 'csv'}`);
    },
    onSuccess: invalidateAll,
  });

  const close = closeQuery.data;
  const readiness = readinessQuery.data;
  const validation = validationQuery.data;
  const stage = close?.stage ?? 'NOT_STARTED';

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">마감 상태</h2>
        <p className="mb-2 text-sm text-slate-600">
          단계: <span className="font-semibold">{STAGE_LABEL[stage]}</span>
          {close && (
            <>
              {' '}
              · 상태: <span className="font-semibold">{close.status}</span> · 버전 {close.version}
            </>
          )}
          {!close && !closeQuery.isLoading && <span className="ml-2 text-slate-400">(아직 제출 전)</span>}
        </p>

        {readiness && (
          <div className={`mb-3 rounded-lg border p-3 text-sm ${readiness.blocked ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-green-300 bg-green-50 text-green-700'}`}>
            {readiness.blocked ? (
              <>
                <p className="font-semibold">마감 차단 사유:</p>
                <ul className="list-inside list-disc">
                  {readiness.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </>
            ) : (
              '마감 진행 가능(차단 사유 없음)'
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={stage !== 'NOT_STARTED' || readiness?.blocked || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            사업장 제출
          </button>
          <button
            type="button"
            disabled={stage !== 'SITE_SUBMITTED' || approveMutation.isPending}
            onClick={() => approveMutation.mutate()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            권역 승인
          </button>
          <button
            type="button"
            disabled={stage !== 'REGION_APPROVED' || finalizeMutation.isPending}
            onClick={() => finalizeMutation.mutate()}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            본사 확정(마감)
          </button>
        </div>
        <ErrorMessage error={submitMutation.error} />
        <ErrorMessage error={approveMutation.error} />
        <ErrorMessage error={finalizeMutation.error} />

        {close?.status === 'CLOSED' && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">재마감(마감 취소 후 재개)</p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="재마감 사유(필수)"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
              />
              <button
                type="button"
                disabled={!reopenReason.trim() || reopenMutation.isPending}
                onClick={() => reopenMutation.mutate()}
                className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800 disabled:opacity-40"
              >
                재마감
              </button>
            </div>
            <ErrorMessage error={reopenMutation.error} />
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">마감 검증</h2>
          <button
            type="button"
            disabled={runValidationMutation.isPending}
            onClick={() => runValidationMutation.mutate()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40"
          >
            검증 실행
          </button>
        </div>
        {validation ? (
          <>
            <p className="mb-2 text-sm text-slate-600">
              발견 {validation.findingCount}건(차단 {validation.blockingCount}건) · 생성:{' '}
              {new Date(validation.generatedAt).toLocaleString('ko-KR')}
              {validation.acknowledgedAt && <span className="ml-2 text-green-700">확인 완료</span>}
            </p>
            {validation.findings.length > 0 && (
              <ul className="mb-2 list-inside list-disc text-sm text-slate-600">
                {validation.findings.map((f) => (
                  <li key={f.id} className={f.severity === 'BLOCKING' ? 'text-red-600' : undefined}>
                    [{f.severity}] {f.message}
                  </li>
                ))}
              </ul>
            )}
            {!validation.acknowledgedAt && (
              <button
                type="button"
                disabled={acknowledgeMutation.isPending}
                onClick={() => acknowledgeMutation.mutate(validation.id)}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                확인 처리
              </button>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">검증 이력이 없습니다.</p>
        )}
        <ErrorMessage error={runValidationMutation.error} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">급여 명세 산출</h2>
          <button
            type="button"
            disabled={!close || computeMutation.isPending}
            title={!close ? '사업장 제출 이후에만 산출·저장할 수 있습니다.' : undefined}
            onClick={() => computeMutation.mutate()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            산출·저장
          </button>
        </div>
        <ErrorMessage error={computeMutation.error} />
        {statementQuery.data && statementQuery.data.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">소정(분)</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">승인 연장(분)</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">미승인 연장(분)</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">기본급</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">연장수당</th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">야간수당</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statementQuery.data
                  .filter((l) => l.layoutType === 'MONTHLY')
                  .map((l) => (
                    <tr key={l.employeeId}>
                      <td className="px-3 py-2 text-sm text-slate-700">
                        {l.employee ? `${l.employee.name} (${l.employee.employeeNo})` : l.employeeId}
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-slate-600">{l.scheduledWorkMinutes.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-600">{l.approvedOvertimeMinutes.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-600">{l.unapprovedOvertimeMinutes.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-600">{l.basePayAmount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-600">{l.overtimePayAmount.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-sm text-slate-600">{l.nightPayAmount.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-500">저장된 명세가 없습니다. 산출·저장을 눌러 생성하세요.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">내보내기</h2>
        <div className="flex items-center gap-2">
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'EXCEL' | 'CSV')}
          >
            <option value="EXCEL">Excel</option>
            <option value="CSV">CSV</option>
          </select>
          <button
            type="button"
            disabled={!close || exportMutation.isPending}
            title={!close ? '사업장 제출 이후에만 내보낼 수 있습니다.' : undefined}
            onClick={() => exportMutation.mutate()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-600 disabled:opacity-40"
          >
            내보내기
          </button>
        </div>
        <ErrorMessage error={exportMutation.error} />
        {exportHistoryQuery.data && exportHistoryQuery.data.length > 0 && (
          <ul className="mt-3 text-sm text-slate-500">
            {exportHistoryQuery.data.map((h) => (
              <li key={h.id}>
                {h.format} · {new Date(h.exportedAt).toLocaleString('ko-KR')}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** STEP11 급여 마감 및 연동 — 사업장 제출→권역 승인→본사 확정 3단계
 * 결재선, 마감 전 차단 사유(readiness), 검증 리포트, 명세 산출, 내보내기까지
 * 하나의 화면에서 다룬다. */
export default function PayrollClosePage() {
  const [siteId, setSiteId] = useState('');
  const [yearMonth, setYearMonth] = useState(thisYearMonth());
  const principalQuery = usePrincipal();
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 사업장·권역·본사 관리자만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">급여 마감</h1>

      <div className="flex items-end gap-4">
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
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">마감월</label>
          <input
            type="month"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
          />
        </div>
      </div>

      {siteId === '' ? <p className="text-slate-500">사업장을 선택하세요.</p> : <PayrollCloseView key={`${siteId}-${yearMonth}`} siteId={siteId} yearMonth={yearMonth} />}
    </div>
  );
}
