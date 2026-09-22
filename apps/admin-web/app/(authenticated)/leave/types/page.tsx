'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { leaveTypeApi, type LeaveCategory, type LeaveDeductionUnit } from '../../../../lib/api/leaveApi';

const ALLOWED_ROLES = new Set(['ADMIN', 'HQ_HR']);
const CATEGORIES: LeaveCategory[] = [
  'ANNUAL',
  'HALF_DAY',
  'QUARTER_DAY',
  'CONGRATULATION',
  'PUBLIC',
  'SICK',
  'UNPAID',
  'SUBSTITUTE',
  'COMPENSATORY',
  'REGULAR',
  'MATERNITY',
];
const DEDUCTION_UNITS: LeaveDeductionUnit[] = ['FULL_DAY', 'HALF_DAY', 'HOUR'];

// 2026-09 수정사항: 분류/차감 단위를 화면에서 전부 한글로 표시한다.
const CATEGORY_LABELS_KO: Record<LeaveCategory, string> = {
  ANNUAL: '연차',
  HALF_DAY: '반차',
  QUARTER_DAY: '반반차',
  CONGRATULATION: '경조휴가',
  PUBLIC: '공가',
  SICK: '병가',
  UNPAID: '무급휴직',
  SUBSTITUTE: '대체휴무',
  COMPENSATORY: '보상휴가',
  REGULAR: '정기휴가',
  MATERNITY: '산전후휴가',
};
const DEDUCTION_UNIT_LABELS_KO: Record<LeaveDeductionUnit, string> = {
  FULL_DAY: '1일',
  HALF_DAY: '반일',
  HOUR: '시간',
};

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function CreateForm() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<LeaveCategory>('ANNUAL');
  const [paid, setPaid] = useState(true);
  const [deductionUnit, setDeductionUnit] = useState<LeaveDeductionUnit>('FULL_DAY');
  const [evidenceRequired, setEvidenceRequired] = useState(false);
  const [deadline, setDeadline] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      leaveTypeApi.create({
        code,
        name,
        category,
        paid,
        deductionUnit,
        evidenceRequired,
        applicationDeadlineDaysBeforeUse: deadline === '' ? undefined : Number(deadline),
      }),
    onSuccess: () => {
      setCode('');
      setName('');
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
    },
  });

  const canSubmit = code.trim() !== '' && name.trim() !== '';

  return (
    <form
      className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">코드</label>
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">이름</label>
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">분류</label>
        <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value as LeaveCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS_KO[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">차감 단위</label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={deductionUnit}
          onChange={(e) => setDeductionUnit(e.target.value as LeaveDeductionUnit)}
        >
          {DEDUCTION_UNITS.map((u) => (
            <option key={u} value={u}>
              {DEDUCTION_UNIT_LABELS_KO[u]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">신청 기한(사용 며칠 전, 선택)</label>
        <input type="number" min={0} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </div>
      <div className="flex items-end gap-4">
        <label className="flex items-center gap-1 text-sm text-slate-700">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          유급
        </label>
        <label className="flex items-center gap-1 text-sm text-slate-700">
          <input type="checkbox" checked={evidenceRequired} onChange={(e) => setEvidenceRequired(e.target.checked)} />
          증빙 필수
        </label>
      </div>
      <div className="md:col-span-3">
        <button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          휴가 유형 추가
        </button>
        <ErrorMessage error={mutation.error} />
      </div>
    </form>
  );
}

/** 휴가 유형(LeaveType) 마스터 데이터 관리 — 신규 유형 추가 시 코드 중복은
 * 백엔드가 거부한다. */
export default function LeaveTypesPage() {
  const principalQuery = usePrincipal();
  const listQuery = useQuery({ queryKey: ['leave-types'], queryFn: () => leaveTypeApi.list() });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 HQ_HR·ADMIN 권한만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">휴가 유형 관리</h1>
      <CreateForm />

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">코드</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">이름</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">분류</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">유급</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">차감 단위</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-slate-500">증빙</th>
              <th className="px-3 py-2 text-right text-xs font-medium uppercase text-slate-500">신청 기한</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(listQuery.data ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-slate-400">
                  등록된 휴가 유형이 없습니다.
                </td>
              </tr>
            )}
            {listQuery.data?.map((t) => (
              <tr key={t.id}>
                <td className="px-3 py-2 text-sm text-slate-700">{t.code}</td>
                <td className="px-3 py-2 text-sm text-slate-700">{t.name}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{CATEGORY_LABELS_KO[t.category]}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{t.paid ? '유급' : '무급'}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{DEDUCTION_UNIT_LABELS_KO[t.deductionUnit]}</td>
                <td className="px-3 py-2 text-sm text-slate-600">{t.evidenceRequired ? '필요' : '-'}</td>
                <td className="px-3 py-2 text-right text-sm text-slate-600">
                  {t.applicationDeadlineDaysBeforeUse ?? '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
