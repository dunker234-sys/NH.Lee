'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { useEmployeeNameMap } from '../../../../lib/useEmployeeNameMap';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { employeesApi } from '../../../../lib/api/employeesApi';
import { adminCorrectionApi, correctionReportApi, type CorrectionReasonCode } from '../../../../lib/api/correctionApi';

const ALLOWED_ROLES = new Set(['HQ_HR']);
const REASON_LABEL: Record<CorrectionReasonCode, string> = {
  PUNCH_MISSING: '타각 누락',
  DEVICE_ERROR: '기기 오류',
  NETWORK_FAILURE: '통신 장애',
  DISPATCH: '외근',
  LOCATION_ERROR: '위치 오차',
  SCHEDULE_CHANGE: '스케줄 변경',
  BREAK_NOT_GRANTED: '휴게 미부여 신고',
  OTHER: '기타',
};
const PUNCH_AFFECTING = new Set<CorrectionReasonCode>(['PUNCH_MISSING', 'DEVICE_ERROR', 'NETWORK_FAILURE']);
const PUNCH_TYPE_LABEL = { IN: '출근', OUT: '퇴근', BREAK_OUT: '휴게 시작', BREAK_IN: '휴게 종료' } as const;

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function CreateForm() {
  const [siteId, setSiteId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [targetWorkDate, setTargetWorkDate] = useState('');
  const [reasonCode, setReasonCode] = useState<CorrectionReasonCode>('PUNCH_MISSING');
  const [reasonDetail, setReasonDetail] = useState('');
  const [punchType, setPunchType] = useState<keyof typeof PUNCH_TYPE_LABEL>('IN');
  const [recordedAt, setRecordedAt] = useState('');
  const [lastResult, setLastResult] = useState<string | null>(null);

  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const employeesQuery = useQuery({ queryKey: ['employees', siteId], queryFn: () => employeesApi.list(siteId), enabled: siteId !== '' });

  const mutation = useMutation({
    mutationFn: () => {
      const afterValue: Record<string, unknown> = PUNCH_AFFECTING.has(reasonCode)
        ? { punchType, recordedAt: new Date(recordedAt).toISOString() }
        : reasonCode === 'BREAK_NOT_GRANTED'
          ? { breakNotGranted: true }
          : { note: reasonDetail };
      return adminCorrectionApi.create({ employeeId, targetWorkDate, reasonCode, reasonDetail, afterValue });
    },
    onSuccess: () => {
      setLastResult('직권 정정을 등록했습니다.');
      setReasonDetail('');
    },
  });

  const needsPunchFields = PUNCH_AFFECTING.has(reasonCode);
  const canSubmit = employeeId !== '' && targetWorkDate !== '' && reasonDetail.trim() !== '' && (!needsPunchFields || recordedAt !== '');

  return (
    <form
      className="flex max-w-lg flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setLastResult(null);
        mutation.mutate();
      }}
    >
      <p className="text-sm text-slate-500">HQ_HR만 사용할 수 있습니다. 근로자 본인 신청이 아니라 관리자가 직접 지정하는 정정입니다(요구사항 4.7-4).</p>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">사업장</label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value);
            setEmployeeId('');
          }}
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
        <label className="mb-1 block text-sm font-medium text-slate-700">직원</label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
          disabled={siteId === ''}
        >
          <option value="">선택하세요</option>
          {employeesQuery.data?.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.name} ({emp.employeeNo})
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">대상 근로일</label>
        <input type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={targetWorkDate} onChange={(e) => setTargetWorkDate(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">사유 코드</label>
        <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={reasonCode} onChange={(e) => setReasonCode(e.target.value as CorrectionReasonCode)}>
          {(Object.keys(REASON_LABEL) as CorrectionReasonCode[]).map((c) => (
            <option key={c} value={c}>
              {REASON_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      {needsPunchFields && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">타각 유형</label>
            <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={punchType} onChange={(e) => setPunchType(e.target.value as keyof typeof PUNCH_TYPE_LABEL)}>
              {(Object.keys(PUNCH_TYPE_LABEL) as (keyof typeof PUNCH_TYPE_LABEL)[]).map((t) => (
                <option key={t} value={t}>
                  {PUNCH_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">정정 시각</label>
            <input type="datetime-local" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} />
          </div>
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">상세 사유 (필수)</label>
        <textarea className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} />
      </div>
      <button type="submit" disabled={!canSubmit || mutation.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
        직권 정정 등록
      </button>
      {lastResult && !mutation.isError && <p className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-700">{lastResult}</p>}
      <ErrorMessage error={mutation.error} />
    </form>
  );
}

function AdminDirectHistory({ siteId }: { siteId: string }) {
  const { nameById } = useEmployeeNameMap(siteId);
  const query = useQuery({
    queryKey: ['correction-report', 'admin-direct', siteId],
    queryFn: () => correctionReportApi.list({ siteId: siteId || undefined, requestSource: 'ADMIN_DIRECT' }),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">직원</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">대상일</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">사유코드</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">상세</th>
            <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">상태</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {(query.data ?? []).length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">
                직권 정정 이력이 없습니다.
              </td>
            </tr>
          )}
          {query.data?.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 text-sm text-slate-700">{siteId ? (nameById.get(r.employeeId) ?? r.employeeId) : r.employeeId}</td>
              <td className="px-3 py-2 text-sm text-slate-600">{r.targetWorkDate.slice(0, 10)}</td>
              <td className="px-3 py-2 text-sm text-slate-600">{REASON_LABEL[r.reasonCode]}</td>
              <td className="max-w-xs px-3 py-2 text-sm text-slate-600">{r.reasonDetail}</td>
              <td className="px-3 py-2 text-sm text-slate-600">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 직권 정정(요구사항 4.7-4) — HQ_HR만. requestSource=ADMIN_DIRECT 전량이
 * 곧 추적 리포트다(별도 테이블 없음, correction-report.controller.ts 주석과
 * 동일 설계). */
export default function AdminCorrectionPage() {
  const [historySiteId, setHistorySiteId] = useState('');
  const principalQuery = usePrincipal();
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 HQ_HR 권한만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">직권 정정</h1>
      <CreateForm />

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">직권 정정 이력(전량 추적)</h2>
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={historySiteId} onChange={(e) => setHistorySiteId(e.target.value)}>
            <option value="">전체 사업장</option>
            {sitesQuery.data?.items.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <AdminDirectHistory siteId={historySiteId} />
      </div>
    </div>
  );
}
