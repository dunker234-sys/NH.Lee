'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { PunchType } from '@attendance/shared-types';
import { ApiError } from '../../../lib/apiClient';
import { punchApi } from '../../../lib/api/punchApi';
import { sitesApi } from '../../../lib/api/sitesApi';
import { getOrCreateDeviceId } from '../../../lib/deviceId';

const PUNCH_TYPE_LABEL: Record<PunchType, string> = {
  IN: '출근',
  OUT: '퇴근',
  BREAK_OUT: '휴게 시작',
  BREAK_IN: '휴게 종료',
};

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
      <h1 className="text-xl font-bold">PC 웹 타각</h1>

      {sitesQuery.isLoading && <p className="text-slate-500">불러오는 중...</p>}
      {sitesQuery.isError && <p className="text-red-600">사업장 정보를 불러올 수 없습니다.</p>}

      {site && (
        <>
          <p className="text-slate-600">{site.name}</p>

          <div className="flex gap-3">
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
            <p className="rounded-lg border border-green-300 bg-green-50 p-4 text-green-700">{lastResult}</p>
          )}

          {ipError && <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">차단됨: {ipError}</p>}
          {punchMutation.isError && !ipError && (
            <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">처리 중 오류가 발생했습니다.</p>
          )}
        </>
      )}
    </div>
  );
}
