'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PunchType, SiteSummary } from '@attendance/shared-types';
import { ApiError } from '../../../lib/apiClient';
import { punchApi } from '../../../lib/api/punchApi';
import { qrPosterApi } from '../../../lib/api/qrPosterApi';
import { sitesApi } from '../../../lib/api/sitesApi';
import { getOrCreateDeviceId } from '../../../lib/deviceId';

const PUNCH_TYPE_LABEL: Record<PunchType, string> = {
  IN: '출근',
  OUT: '퇴근',
  BREAK_OUT: '휴게 시작',
  BREAK_IN: '휴게 종료',
};

/** 인쇄용 일단위 QR(수정사항). 근로일 단위 정적 코드라 키오스크 실시간 QR과 달리
 * 자정 전까지는 재조회해도 같은 코드다 — 자동 갱신 타이머가 필요 없다. */
function QrPosterSection({ sites }: { sites: SiteSummary[] }) {
  const [siteId, setSiteId] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // sites는 부모의 useQuery가 비동기로 채우므로, 마운트 시점엔 항상 빈
  // 배열이다 — useState 초기값이 아니라 로드된 뒤 한 번 동기화해야 한다.
  useEffect(() => {
    if (siteId === '' && sites.length > 0) setSiteId(sites[0].id);
  }, [sites, siteId]);

  const codeQuery = useQuery({
    queryKey: ['qr-poster', siteId],
    queryFn: () => qrPosterApi.get(siteId),
    enabled: siteId !== '',
    retry: false,
  });

  const provisionMutation = useMutation({
    mutationFn: () => qrPosterApi.provision(siteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['qr-poster', siteId] }),
  });

  useEffect(() => {
    if (!codeQuery.data) {
      setImageDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(codeQuery.data.code, { width: 320, margin: 1 }).then((url) => {
      if (!cancelled) setImageDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [codeQuery.data]);

  const notProvisioned = codeQuery.error instanceof ApiError && codeQuery.error.status === 404;
  const siteName = sites.find((s) => s.id === siteId)?.name ?? '';

  if (sites.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 print:border-none print:p-0">
      <div className="print:hidden">
        <h2 className="text-lg font-bold">QR 코드 (일단위 출력)</h2>
        <p className="mt-1 text-sm text-slate-500">
          하루 동안 유효한 QR입니다. 인쇄해 현장에 붙여두면 근로자가 본인 폰(모바일 앱)으로 스캔해 타각할 수 있습니다.
        </p>
        <select
          className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
        >
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {notProvisioned && (
        <div className="mt-3 print:hidden">
          <p className="text-sm text-amber-700">이 사업장에는 아직 QR이 발급되지 않았습니다.</p>
          <button
            type="button"
            onClick={() => provisionMutation.mutate()}
            disabled={provisionMutation.isPending}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            QR 발급
          </button>
        </div>
      )}

      {codeQuery.data && imageDataUrl && (
        <div className="mt-4 flex flex-col items-center gap-3 print:mt-0 print:gap-6">
          <p className="hidden text-2xl font-bold print:block">{siteName}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageDataUrl} alt="일단위 타각 QR 코드" className="h-64 w-64 print:h-96 print:w-96" />
          <p className="text-sm text-slate-600 print:text-lg">근로일 {codeQuery.data.workDate} 유효(자정 갱신)</p>
          <p className="hidden text-base print:block">본인 앱의 스캔 화면으로 이 QR을 스캔하세요.</p>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 print:hidden"
          >
            인쇄
          </button>
        </div>
      )}
    </div>
  );
}

/** 세션 유무 확인/로그아웃은 (authenticated)/layout.tsx가 맡는다 — 이
 * 페이지는 로그인돼 있다는 전제 위에서 타각 기능만 신경 쓴다. */
export default function PunchPage() {
  const [lastResult, setLastResult] = useState<string | null>(null);

  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  const punchMutation = useMutation({
    mutationFn: (input: { punchType: PunchType; siteId: string }) =>
      punchApi.create({
        punchType: input.punchType,
        recordedAt: new Date().toISOString(),
        siteId: input.siteId,
        registrationMethod: 'PC',
        deviceId: getOrCreateDeviceId(),
        clientEventId: crypto.randomUUID(),
      }),
    onSuccess: (_, variables) => {
      setLastResult(`${PUNCH_TYPE_LABEL[variables.punchType]} 완료`);
    },
  });

  const site = sitesQuery.data?.items[0];
  const ipError =
    punchMutation.error instanceof ApiError && punchMutation.error.status === 403
      ? (punchMutation.error.body as { message?: string } | null)?.message
      : null;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <div className="print:hidden">
        <h1 className="text-xl font-bold">PC 웹 타각</h1>

        {sitesQuery.isLoading && <p className="text-slate-500">불러오는 중...</p>}
        {sitesQuery.isError && <p className="text-red-600">사업장 정보를 불러올 수 없습니다.</p>}

        {site && (
          <>
            <p className="text-slate-600">{site.name}</p>

            <div className="mt-4 flex gap-3">
              {(['IN', 'OUT'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  disabled={punchMutation.isPending}
                  onClick={() => punchMutation.mutate({ punchType: type, siteId: site.id })}
                  className="flex-1 rounded-xl bg-blue-600 py-6 text-lg font-bold text-white disabled:opacity-40"
                >
                  {PUNCH_TYPE_LABEL[type]}
                </button>
              ))}
            </div>

            {lastResult && !punchMutation.isError && (
              <p className="mt-4 rounded-lg border border-green-300 bg-green-50 p-4 text-green-700">{lastResult}</p>
            )}

            {ipError && <p className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">차단됨: {ipError}</p>}
            {punchMutation.isError && !ipError && (
              <p className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">처리 중 오류가 발생했습니다.</p>
            )}
          </>
        )}
      </div>

      <QrPosterSection sites={sitesQuery.data?.items ?? []} />
    </div>
  );
}
