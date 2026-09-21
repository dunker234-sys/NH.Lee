'use client';

import { useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { scheduleApi } from '../../../lib/api/scheduleApi';

interface Props {
  siteId: string;
  yearMonth: string;
  currentGridVersion: string;
  onCommitted: () => void;
}

type ValidateResult = Awaited<ReturnType<typeof scheduleApi.excelValidate>>;

/** 파싱은 서버(apps/api)에서만 한다 — admin-web은 원본 파일을 그대로
 * 올리고, 서버가 돌려준 행 오류/충돌 차분/commitToken을 그리기만 한다. */
export function ExcelUploadPanel({ siteId, yearMonth, currentGridVersion, onCommitted }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await scheduleApi.excelValidate(siteId, yearMonth, currentGridVersion, file);
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
      await scheduleApi.excelCommit(result.commitToken);
      setResult(null);
      setOpen(false);
      onCommitted();
    } catch (e) {
      setError(e instanceof ApiError ? String((e.body as { message?: string } | null)?.message ?? '반영 실패') : '서버에 연결할 수 없습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function handleTemplateDownload() {
    // GET이라 apiFetch(JSON)를 쓰지 않는다 — 바이너리 응답을 그대로 받아야 한다.
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
    window.open(`${base}/admin/schedule/excel/template?siteId=${siteId}`, '_blank');
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
        엑셀 업로드
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">엑셀 업로드</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 underline">
          닫기
        </button>
      </div>

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
          <p className="font-semibold">행별 오류 ({result.rowErrors.length}건)</p>
          <ul className="list-disc pl-5">
            {result.rowErrors.map((e) => (
              <li key={e.rowNumber}>
                {e.rowNumber}행: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result && result.conflictDiff && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          업로드를 읽은 시점 이후 그리드가 바뀌었습니다. 그리드를 새로고침한 뒤 다시 업로드해 주세요.
        </div>
      )}

      {result && result.commitToken && (
        <div className="mt-3 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <p className="mb-2">검증을 통과했습니다. 반영하시겠습니까?</p>
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
    </div>
  );
}
