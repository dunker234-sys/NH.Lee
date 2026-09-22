'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { leaveAccrualApi, leavePromotionApi } from '../../../../lib/api/leaveApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);
const POLICY_ROLES = new Set(['ADMIN', 'HQ_HR']);

const DEFAULT_POLICY_VALUES = `{
  "article611FirstNoticeWindowDays": 10,
  "article611FirstNoticeAnchorMonthsBeforeExpiry": 6,
  "article611EmployeeResponseWindowDays": 10,
  "article611SecondNoticeDeadlineMonthsBeforeExpiry": 2,
  "article612WaveAFirstNoticeWindowDays": 10,
  "article612WaveAFirstNoticeAnchorMonthsBefore": 3,
  "article612WaveASecondNoticeDeadlineMonthsBefore": 1,
  "article612WaveBFirstNoticeWindowDays": 5,
  "article612WaveBFirstNoticeAnchorMonthsBefore": 1,
  "article612WaveBSecondNoticeDeadlineDaysBefore": 10
}`;

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function BatchTriggerCard({
  title,
  description,
  siteId,
  onRun,
}: {
  title: string;
  description: string;
  siteId: string;
  onRun: (asOfDate: string) => Promise<unknown>;
}) {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [result, setResult] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => onRun(asOfDate),
    onSuccess: (data) => setResult(JSON.stringify(data)),
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
      <div className="mt-3 flex items-center gap-2">
        <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
        <button
          type="button"
          disabled={siteId === '' || mutation.isPending}
          onClick={() => {
            setResult(null);
            mutation.mutate();
          }}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          실행
        </button>
      </div>
      {result && <p className="mt-2 break-all rounded-lg border border-green-300 bg-green-50 p-3 text-xs text-green-700">{result}</p>}
      <ErrorMessage error={mutation.error} />
    </div>
  );
}

function PolicyForm() {
  const [siteWide, setSiteWide] = useState(true);
  const [siteId, setSiteId] = useState('');
  const [effectiveStartDate, setEffectiveStartDate] = useState('');
  const [valuesJson, setValuesJson] = useState(DEFAULT_POLICY_VALUES);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  const mutation = useMutation({
    mutationFn: () => {
      const values = JSON.parse(valuesJson);
      return leavePromotionApi.updatePolicy({ siteId: siteWide ? undefined : siteId, effectiveStartDate, values });
    },
  });

  function handleSubmit() {
    setJsonError(null);
    try {
      JSON.parse(valuesJson);
    } catch {
      setJsonError('올바른 JSON 형식이 아닙니다.');
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-slate-700">연차 사용 촉진(§61) 기한 정책</h2>
      <p className="mt-1 text-sm text-slate-500">법정 기한보다 늦어지는 값은 저장 시점에 거부됩니다(400).</p>

      <div className="mt-3 flex flex-col gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={siteWide} onChange={(e) => setSiteWide(e.target.checked)} />
          전사 기본값으로 저장(체크 해제 시 특정 사업장 전용)
        </label>
        {!siteWide && (
          <select className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">사업장 선택</option>
            {sitesQuery.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">적용 시작일</label>
          <input
            type="date"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={effectiveStartDate}
            onChange={(e) => setEffectiveStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">정책 값 (JSON)</label>
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
            rows={12}
            value={valuesJson}
            onChange={(e) => setValuesJson(e.target.value)}
          />
        </div>
        <button
          type="button"
          disabled={effectiveStartDate === '' || (!siteWide && siteId === '') || mutation.isPending}
          onClick={handleSubmit}
          className="w-fit rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          정책 저장
        </button>
        {jsonError && <p className="text-sm text-red-600">{jsonError}</p>}
        {mutation.isSuccess && <p className="text-sm text-green-700">저장했습니다.</p>}
        <ErrorMessage error={mutation.error} />
      </div>
    </div>
  );
}

/** 연차 발생(§60)/사용촉진(§61) 배치 수동 트리거 + 촉진 정책 설정 —
 * 자동 스케줄링은 파일럿 검증 후 후속 작업이라 수동/테스트 트리거만
 * 제공한다(컨트롤러 주석과 동일). */
export default function LeaveBatchesPage() {
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
      <h1 className="text-xl font-bold">연차 배치 관리</h1>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">사업장</label>
        <select className="w-full max-w-xs rounded-lg border border-slate-300 px-3 py-2 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">선택하세요</option>
          {sitesQuery.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <BatchTriggerCard
        title="연차 발생 배치"
        description="기준일 시점 재직자 대비 연차 발생 처리를 실행합니다."
        siteId={siteId}
        onRun={(asOfDate) => leaveAccrualApi.run(asOfDate, siteId)}
      />
      <BatchTriggerCard
        title="연차 사용촉진 배치"
        description="§61 사용촉진 절차(1·2차 통보)를 기준일 기준으로 실행합니다."
        siteId={siteId}
        onRun={(asOfDate) => leavePromotionApi.run(asOfDate, siteId)}
      />

      {POLICY_ROLES.has(role) && <PolicyForm />}
    </div>
  );
}
