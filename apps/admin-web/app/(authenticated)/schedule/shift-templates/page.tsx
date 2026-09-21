'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { scheduleApi } from '../../../../lib/api/scheduleApi';

const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const FLEXIBLE_TYPES = [
  { value: '', label: '표준(비유연)' },
  { value: 'FLEXIBLE_BIWEEKLY', label: '탄력적 2주제' },
  { value: 'FLEXIBLE_QUARTERLY', label: '탄력적 3개월제' },
  { value: 'FLEXIBLE_SEMIANNUAL', label: '탄력적 6개월제' },
  { value: 'SELECTIVE_MONTHLY', label: '선택적 근로시간제' },
];

export default function ShiftTemplatesPage() {
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    startTime: '09:00',
    endTime: '18:00',
    breakStartTime: '12:00',
    breakEndTime: '13:00',
    crossesMidnight: false,
    applicableWeekdays: [1, 2, 3, 4, 5],
    flexibleWorkType: '',
  });
  const [error, setError] = useState<string | null>(null);

  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const activeSiteId = siteId ?? sitesQuery.data?.items[0]?.id ?? null;

  const templatesQuery = useQuery({
    queryKey: ['schedule', 'shift-templates', activeSiteId],
    queryFn: () => scheduleApi.listShiftTemplates(activeSiteId!),
    enabled: Boolean(activeSiteId),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['schedule', 'shift-templates', activeSiteId] });
  }

  const createMutation = useMutation({
    mutationFn: () =>
      scheduleApi.createShiftTemplate({
        siteId: activeSiteId!,
        name: form.name,
        startTime: form.startTime,
        endTime: form.endTime,
        breakStartTime: form.breakStartTime || null,
        breakEndTime: form.breakEndTime || null,
        crossesMidnight: form.crossesMidnight,
        applicableWeekdays: form.applicableWeekdays,
        flexibleWorkType: form.flexibleWorkType || null,
      }),
    onSuccess: () => {
      setForm((f) => ({ ...f, name: '' }));
      invalidate();
    },
    onError: (e) => setError(e instanceof ApiError ? String((e.body as { message?: string } | null)?.message ?? '생성 실패') : '서버에 연결할 수 없습니다.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scheduleApi.deleteShiftTemplate(id),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? String((e.body as { message?: string } | null)?.message ?? '삭제 실패') : '서버에 연결할 수 없습니다.'),
  });

  function toggleWeekday(day: number) {
    setForm((f) => ({
      ...f,
      applicableWeekdays: f.applicableWeekdays.includes(day) ? f.applicableWeekdays.filter((d) => d !== day) : [...f.applicableWeekdays, day].sort(),
    }));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">교대 패턴</h1>
        <select value={activeSiteId ?? ''} onChange={(e) => setSiteId(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
          {sitesQuery.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          createMutation.mutate();
        }}
        className="grid max-w-2xl grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-white p-4"
      >
        <label className="col-span-2 text-sm">
          이름
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" />
        </label>
        <label className="text-sm">
          시작
          <input type="time" value={form.startTime} onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" />
        </label>
        <label className="text-sm">
          종료
          <input type="time" value={form.endTime} onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" />
        </label>
        <label className="text-sm">
          휴게 시작
          <input type="time" value={form.breakStartTime} onChange={(e) => setForm((f) => ({ ...f, breakStartTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" />
        </label>
        <label className="text-sm">
          휴게 종료
          <input type="time" value={form.breakEndTime} onChange={(e) => setForm((f) => ({ ...f, breakEndTime: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1" />
        </label>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.crossesMidnight} onChange={(e) => setForm((f) => ({ ...f, crossesMidnight: e.target.checked }))} />
          야간 걸침(자정을 넘는 시프트)
        </label>
        <div className="col-span-2 flex gap-2 text-sm">
          {WEEKDAY_LABELS.map((label, i) => {
            const day = i + 1;
            return (
              <label key={day} className="flex items-center gap-1">
                <input type="checkbox" checked={form.applicableWeekdays.includes(day)} onChange={() => toggleWeekday(day)} />
                {label}
              </label>
            );
          })}
        </div>
        <label className="col-span-2 text-sm">
          유연근로 유형
          <select value={form.flexibleWorkType} onChange={(e) => setForm((f) => ({ ...f, flexibleWorkType: e.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1">
            {FLEXIBLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={!activeSiteId || createMutation.isPending}
          className="col-span-2 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          추가
        </button>
      </form>

      <table className="max-w-3xl border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500">
            <th className="pr-4">이름</th>
            <th className="pr-4">시간</th>
            <th className="pr-4">휴게</th>
            <th className="pr-4">유연근로</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {templatesQuery.data?.map((t) => (
            <tr key={t.id} className="rounded-lg bg-white">
              <td className="pr-4 py-1">{t.name}</td>
              <td className="pr-4 py-1">
                {t.startTime}~{t.endTime}
                {t.crossesMidnight ? ' (익일)' : ''}
              </td>
              <td className="pr-4 py-1">{t.breakStartTime ? `${t.breakStartTime}~${t.breakEndTime}` : '-'}</td>
              <td className="pr-4 py-1">{FLEXIBLE_TYPES.find((f) => f.value === (t.flexibleWorkType ?? ''))?.label ?? t.flexibleWorkType}</td>
              <td className="py-1">
                <button type="button" onClick={() => deleteMutation.mutate(t.id)} className="text-xs text-red-600 underline">
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
