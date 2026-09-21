'use client';

import { useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { migrationApi } from '../../../lib/api/migrationApi';

interface Props {
  siteId: string;
  onCommitted: () => void;
}

type ValidateResult = Awaited<ReturnType<typeof migrationApi.excelValidate>>;

/** ExcelUploadPanel.tsx(편성)과 같은 3-상태(행오류/커밋가능/완료) 흐름 —
 * 파싱·검증은 서버에서만 하고 여기서는 결과만 그린다. */
export function MigrationUploadPanel({ siteId, onCommitted }: Props) {
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<Awaited<ReturnType<typeof migrationApi.excelCommit>> | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    setCommitted(null);
    try {
      const res = await migrationApi.excelValidate(siteId, file);
      setResult(res);
    } catch (e) {
      setError(e instanceof ApiError ? String((e.body as { message?: string } | null)?.message ?? '검증 실패') : '서버에 연결할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!result?.commitToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await migrationApi.excelCommit(result.commitToken);
      setCommitted(res);
      setResult(null);
      onCommitted();
    } catch (e) {
      setError(e instanceof ApiError ? String((e.body as { message?: string } | null)?.message ?? '반영 실패') : '서버에 연결할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  function handleTemplateDownload() {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
    window.open(`${base}/admin/migration/excel/template?siteId=${siteId}`, '_blank');
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">이관 워크북 업로드</h3>
      <div className="flex items-center gap-3">
        <button type="button" onClick={handleTemplateDownload} className="text-xs text-blue-600 underline">
          템플릿 다운로드
        </button>
        <input
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="text-xs"
        />
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && result.rowErrors.length > 0 && (
        <div className="mt-3 space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <p className="font-semibold">행별 오류 ({result.rowErrors.length}건) — dry-run이라 아무것도 적재되지 않았습니다.</p>
          <ul className="list-disc pl-5">
            {result.rowErrors.map((e, i) => (
              <li key={i}>
                [{e.sheet}] {e.rowNumber}행{e.employeeNo ? ` (사번 ${e.employeeNo})` : ''}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.commitToken && result.rowErrors.length === 0 && (
        <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <p className="mb-2">검증을 통과했습니다(dry-run). 반영하시겠습니까?</p>
          <button
            type="button"
            disabled={busy}
            onClick={handleCommit}
            className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            반영
          </button>
        </div>
      )}

      {committed && (
        <div className="mt-3 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-800">
          <p className="font-semibold">반영 완료</p>
          <p>
            연차잔액 {committed.leaveBalanceRows} · 촉진이력 {committed.promotionLogRows} · 마감월집계 {committed.attendanceMonthlyRows} · 마감월일별상세{' '}
            {committed.attendanceDailyRows} · 교대패턴 {committed.shiftTemplateRows} · 확정스케줄 {committed.scheduleRows}
          </p>
        </div>
      )}
    </div>
  );
}
