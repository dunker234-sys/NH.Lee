'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { usePrincipal } from '../../../lib/usePrincipal';
import { sitesApi } from '../../../lib/api/sitesApi';
import { kioskDevicesApi, type ProvisionKioskDeviceResult } from '../../../lib/api/kioskDevicesApi';

const ALLOWED_ROLES = new Set(['SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN']);

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function ProvisionForm() {
  const [siteId, setSiteId] = useState('');
  const [label, setLabel] = useState('');
  const [result, setResult] = useState<ProvisionKioskDeviceResult | null>(null);
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  const mutation = useMutation({
    mutationFn: () => kioskDevicesApi.provision(siteId, label),
    onSuccess: (data) => {
      setResult(data);
      setLabel('');
    },
  });

  return (
    <form
      className="flex max-w-lg flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(null);
        mutation.mutate();
      }}
    >
      <h2 className="text-sm font-semibold text-slate-700">신규 발급</h2>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">사업장</label>
        <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">선택하세요</option>
          {sitesQuery.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">라벨(예: 정문 키오스크 1)</label>
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <button
        type="submit"
        disabled={siteId === '' || label.trim() === '' || mutation.isPending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        발급
      </button>
      <ErrorMessage error={mutation.error} />

      {result && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">페어링 토큰(이 화면을 벗어나면 다시 볼 수 없습니다):</p>
          <p className="mt-1 break-all font-mono text-xs">{result.credential}</p>
          <p className="mt-2 text-xs">기기 ID: {result.kioskDeviceId}</p>
        </div>
      )}
    </form>
  );
}

function RevokeForm() {
  const [deviceId, setDeviceId] = useState('');
  const [done, setDone] = useState(false);
  const mutation = useMutation({
    mutationFn: () => kioskDevicesApi.revoke(deviceId),
    onSuccess: () => {
      setDone(true);
      setDeviceId('');
    },
  });

  return (
    <form
      className="flex max-w-lg flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(false);
        mutation.mutate();
      }}
    >
      <h2 className="text-sm font-semibold text-slate-700">폐기</h2>
      <p className="text-sm text-slate-500">기기 목록 조회 API가 아직 없어, 발급 시 기록해둔 기기 ID를 직접 입력해야 합니다.</p>
      <input
        placeholder="기기 ID (UUID)"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        value={deviceId}
        onChange={(e) => setDeviceId(e.target.value)}
      />
      <button
        type="submit"
        disabled={deviceId.trim() === '' || mutation.isPending}
        className="w-fit rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40"
      >
        즉시 폐기
      </button>
      {done && <p className="text-sm text-green-700">폐기했습니다. 다음 요청부터 즉시 무효화됩니다.</p>}
      <ErrorMessage error={mutation.error} />
    </form>
  );
}

/** 키오스크 기기 페어링 발급/폐기(STEP5-B) — 백엔드에 목록 조회 API가
 * 없어(provision/revoke만 존재) 발급 화면이 곧 유일한 기기ID 확인 경로다. */
export default function KioskDevicesPage() {
  const principalQuery = usePrincipal();

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 사업장·권역·본사 관리자만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">키오스크 기기 관리</h1>
      <ProvisionForm />
      <RevokeForm />
    </div>
  );
}
