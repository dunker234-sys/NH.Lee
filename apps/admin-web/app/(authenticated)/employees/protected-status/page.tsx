'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { employeesApi } from '../../../../lib/api/employeesApi';
import { employeeProtectedStatusApi } from '../../../../lib/api/employeeProtectedStatusApi';

// leave-deemed-attendance.service.ts(DEEMED_ATTENDANCE_STATUS_TYPES) +
// schedule-validation.service.ts('PREGNANCY')에서 실제로 참조하는 값들.
// DTO 자체는 자유 문자열이라(확장 여지) "직접 입력"도 허용한다.
const KNOWN_STATUS_TYPES = [
  { value: 'PREGNANCY', label: '임신 (PREGNANCY)' },
  { value: 'MATERNITY_LEAVE', label: '출산전후휴가 (MATERNITY_LEAVE)' },
  { value: 'INDUSTRIAL_INJURY_LEAVE', label: '산재요양 (INDUSTRIAL_INJURY_LEAVE)' },
  { value: 'CHILDCARE_LEAVE', label: '육아휴직 (CHILDCARE_LEAVE)' },
  { value: 'REDUCED_WORKING_HOURS_CHILDCARE', label: '육아기 근로시간 단축 (REDUCED_WORKING_HOURS_CHILDCARE)' },
] as const;
const CUSTOM_OPTION = '__CUSTOM__';

function RegisterForm() {
  const [siteId, setSiteId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [statusTypeChoice, setStatusTypeChoice] = useState<string>(KNOWN_STATUS_TYPES[0].value);
  const [customStatusType, setCustomStatusType] = useState('');
  const [effectiveStartDate, setEffectiveStartDate] = useState('');
  const [effectiveEndDate, setEffectiveEndDate] = useState('');
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);

  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const employeesQuery = useQuery({
    queryKey: ['employees', siteId],
    queryFn: () => employeesApi.list(siteId),
    enabled: siteId !== '',
  });

  const mutation = useMutation({
    mutationFn: () =>
      employeeProtectedStatusApi.set(employeeId, {
        statusType: statusTypeChoice === CUSTOM_OPTION ? customStatusType : statusTypeChoice,
        effectiveStartDate,
        effectiveEndDate: effectiveEndDate || undefined,
      }),
    onSuccess: () => {
      const employeeLabel = employeesQuery.data?.find((e) => e.id === employeeId)?.name ?? employeeId;
      setLastSubmitted(`${employeeLabel} — ${statusTypeChoice === CUSTOM_OPTION ? customStatusType : statusTypeChoice} 등록 완료`);
      setEmployeeId('');
      setEffectiveStartDate('');
      setEffectiveEndDate('');
    },
  });

  const resolvedStatusType = statusTypeChoice === CUSTOM_OPTION ? customStatusType : statusTypeChoice;
  const canSubmit = employeeId !== '' && resolvedStatusType.trim() !== '' && effectiveStartDate !== '';

  const errorMessage =
    mutation.error instanceof ApiError ? ((mutation.error.body as { message?: string } | null)?.message ?? '등록에 실패했습니다.') : null;

  return (
    <form
      className="flex max-w-lg flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setLastSubmitted(null);
        mutation.mutate();
      }}
    >
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
        {employeesQuery.isError && <p className="mt-1 text-xs text-red-600">직원 목록을 불러올 수 없습니다.</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">보호 상태 유형</label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={statusTypeChoice}
          onChange={(e) => setStatusTypeChoice(e.target.value)}
        >
          {KNOWN_STATUS_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
          <option value={CUSTOM_OPTION}>직접 입력...</option>
        </select>
        {statusTypeChoice === CUSTOM_OPTION && (
          <input
            type="text"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="statusType 값 (영문 대문자 스네이크케이스 권장)"
            value={customStatusType}
            onChange={(e) => setCustomStatusType(e.target.value)}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">시작일</label>
          <input
            type="date"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={effectiveStartDate}
            onChange={(e) => setEffectiveStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">종료일 (선택)</label>
          <input
            type="date"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={effectiveEndDate}
            onChange={(e) => setEffectiveEndDate(e.target.value)}
          />
          <p className="mt-1 text-xs text-slate-500">미기입 시 무기한</p>
        </div>
      </div>

      <button
        type="submit"
        disabled={!canSubmit || mutation.isPending}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {mutation.isPending ? '등록 중...' : '등록'}
      </button>

      {lastSubmitted && !mutation.isError && (
        <p className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-700">{lastSubmitted}</p>
      )}
      {errorMessage && <p className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</p>}
    </form>
  );
}

/** STEP12 §A3. 백엔드 @Roles('HQ_HR')와 동일 기준으로 화면도 HQ_HR만
 * 허용한다 — 민감정보라 SITE_MANAGER/REGIONAL/ADMIN도 제외한다(계획서
 * SEC-3 근거와 동일: "다른 관리자 역할은 호출할 수 없다").
 * 조회(목록) API가 아직 없어 이 화면은 등록 전용이다. */
export default function EmployeeProtectedStatusPage() {
  const principalQuery = usePrincipal();

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;

  const role = principalQuery.data?.principal.role;
  if (role !== 'HQ_HR') {
    return <p className="text-slate-600">이 화면은 HQ_HR 권한만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">보호 상태 등록</h1>
        <p className="mt-1 text-sm text-slate-500">
          임신·육아휴직 등 민감한 신상 상태를 등록합니다. Employee 본체와 분리 저장되며 암호화됩니다(STEP12 §A3).
        </p>
      </div>
      <RegisterForm />
    </div>
  );
}
