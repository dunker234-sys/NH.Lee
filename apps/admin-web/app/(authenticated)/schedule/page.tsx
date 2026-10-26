'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../lib/apiClient';
import { employeesApi } from '../../../lib/api/employeesApi';
import { sitesApi } from '../../../lib/api/sitesApi';
import { scheduleApi, ScheduleConflict } from '../../../lib/api/scheduleApi';
import { currentYearMonth, daysInYearMonth, isNextDay } from '../../../lib/schedule/dateUtil';
import { clearPendingCells, PendingCell, PendingCellMap } from '../../../lib/schedule/gridState';
import { ConflictDialog, ConflictResolution } from './ConflictDialog';
import { ExcelUploadPanel } from './ExcelUploadPanel';
import { GridView } from './GridView';

function apiErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    const body = e.body as { message?: unknown } | null;
    return String(body?.message ?? fallback);
  }
  return '서버에 연결할 수 없습니다.';
}

export default function SchedulePage() {
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState<string | null>(null);
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [armedTemplateId, setArmedTemplateId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingCellMap>(new Map());
  const [conflicts, setConflicts] = useState<ScheduleConflict[] | null>(null);
  const [banner, setBanner] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [unresolvedWarning, setUnresolvedWarning] = useState<{ code: string; message: string }[] | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });
  const activeSiteId = siteId ?? sitesQuery.data?.items[0]?.id ?? null;

  const employeesQuery = useQuery({
    queryKey: ['employees', activeSiteId],
    queryFn: () => employeesApi.list(activeSiteId!),
    enabled: Boolean(activeSiteId),
  });
  const templatesQuery = useQuery({
    queryKey: ['schedule', 'shift-templates', activeSiteId],
    queryFn: () => scheduleApi.listShiftTemplates(activeSiteId!),
    enabled: Boolean(activeSiteId),
  });
  const gridQuery = useQuery({
    queryKey: ['schedule', 'grid', activeSiteId, yearMonth],
    queryFn: () => scheduleApi.getGrid(activeSiteId!, yearMonth),
    enabled: Boolean(activeSiteId),
  });

  const days = daysInYearMonth(yearMonth);

  function refetchGrid() {
    void queryClient.invalidateQueries({ queryKey: ['schedule', 'grid', activeSiteId, yearMonth] });
  }

  const saveMutation = useMutation({
    mutationFn: async (cells: PendingCellMap) => {
      const all = [...cells.values()];
      const edits = all.filter((c): c is PendingCell & { scheduleId: string; expectedVersion: number } => Boolean(c.scheduleId));
      const creates = all.filter((c) => !c.scheduleId && c.shiftTemplateId);

      if (edits.length > 0) {
        await scheduleApi.patchBulk(
          edits.map((c) => ({ id: c.scheduleId, expectedVersion: c.expectedVersion, shiftTemplateId: c.shiftTemplateId ?? undefined })),
        );
      }

      const byEmployee = new Map<string, PendingCell[]>();
      for (const c of creates) {
        if (!byEmployee.has(c.employeeId)) byEmployee.set(c.employeeId, []);
        byEmployee.get(c.employeeId)!.push(c);
      }
      for (const [employeeId, cells2] of byEmployee) {
        const sorted = [...cells2].sort((a, b) => a.workDate.localeCompare(b.workDate));
        let i = 0;
        while (i < sorted.length) {
          let j = i;
          while (j + 1 < sorted.length && sorted[j + 1].shiftTemplateId === sorted[i].shiftTemplateId && isNextDay(sorted[j].workDate, sorted[j + 1].workDate)) {
            j++;
          }
          const run = sorted.slice(i, j + 1);
          await scheduleApi.generateRoster({
            siteId: activeSiteId!,
            startDate: run[0].workDate,
            endDate: run[run.length - 1].workDate,
            assignments: [{ employeeId, cycleLengthDays: run.length, pattern: run.map((r) => r.shiftTemplateId as string), anchorDate: run[0].workDate }],
          });
          i = j + 1;
        }
      }
    },
    onSuccess: () => {
      setPending(clearPendingCells());
      setBanner({ tone: 'success', text: '저장했습니다.' });
      refetchGrid();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 409) {
        const details = (e.body as { details?: { conflicts?: ScheduleConflict[]; scheduleId?: string; yourValue?: Record<string, unknown>; currentValue?: Record<string, unknown> | null } })
          .details;
        const list = details?.conflicts ?? (details?.scheduleId ? [{ scheduleId: details.scheduleId, yourValue: details.yourValue ?? {}, currentValue: details.currentValue ?? null }] : []);
        setConflicts(list);
      } else {
        setBanner({ tone: 'error', text: apiErrorMessage(e, '저장에 실패했습니다.') });
      }
    },
  });

  function handleConflictApply(resolutions: Map<string, ConflictResolution>) {
    const currentConflicts = conflicts ?? [];
    const next = new Map(pending);
    for (const c of currentConflicts) {
      const entry = [...next.entries()].find(([, v]) => v.scheduleId === c.scheduleId);
      if (!entry) continue;
      const [key, value] = entry;
      const resolution = resolutions.get(c.scheduleId);
      if (resolution === 'theirs') {
        next.delete(key);
      } else {
        const freshVersion = Number(c.currentValue?.version ?? value.expectedVersion);
        next.set(key, { ...value, expectedVersion: freshVersion });
      }
    }
    setConflicts(null);
    setPending(next);
    saveMutation.mutate(next);
  }

  const confirmMutation = useMutation({
    mutationFn: async (input: { override: boolean; overrideReason?: string }) => {
      const draftIds = (gridQuery.data?.rows ?? []).filter((r) => r.status === 'DRAFT').map((r) => r.id);
      if (draftIds.length === 0) return;
      await scheduleApi.confirm(draftIds, input.override, input.overrideReason);
    },
    onSuccess: () => {
      setBanner({ tone: 'success', text: '확정했습니다.' });
      setUnresolvedWarning(null);
      setOverrideReason('');
      refetchGrid();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.body && (e.body as { code?: string }).code === 'SCHEDULE_UNRESOLVED_WARNING') {
        const details = (e.body as { details?: { violations?: { code: string; message: string }[] } }).details;
        setUnresolvedWarning(details?.violations ?? []);
        return;
      }
      setBanner({ tone: 'error', text: apiErrorMessage(e, '확정에 실패했습니다.') });
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">근무스케쥴(계획)</h1>
        <select
          value={activeSiteId ?? ''}
          onChange={(e) => setSiteId(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
        >
          {sitesQuery.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          type="month"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <span className="text-sm text-slate-500">채우기 값:</span>
        <select
          value={armedTemplateId ?? ''}
          onChange={(e) => setArmedTemplateId(e.target.value || null)}
          className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="">선택</option>
          {templatesQuery.data?.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.startTime}~{t.endTime})
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">셀을 클릭하거나 드래그하면 위 값으로 채워집니다.</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            disabled={pending.size === 0 || saveMutation.isPending}
            onClick={() => saveMutation.mutate(pending)}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            저장 {pending.size > 0 ? `(${pending.size})` : ''}
          </button>
          <button
            type="button"
            disabled={confirmMutation.isPending || !(gridQuery.data?.rows.some((r) => r.status === 'DRAFT'))}
            onClick={() => confirmMutation.mutate({ override: false })}
            className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
          >
            이번 달 전체 확정
          </button>
          {activeSiteId && (
            <ExcelUploadPanel
              siteId={activeSiteId}
              yearMonth={yearMonth}
              currentGridVersion={gridQuery.data?.scheduleGridVersion ?? ''}
              onCommitted={refetchGrid}
            />
          )}
        </div>
      </div>

      {banner && (
        <p className={`rounded-lg border p-3 text-sm ${banner.tone === 'error' ? 'border-red-300 bg-red-50 text-red-700' : 'border-green-300 bg-green-50 text-green-700'}`}>
          {banner.text}
        </p>
      )}

      {unresolvedWarning && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="mb-2 font-semibold">해결되지 않은 경고가 있어 확정할 수 없습니다.</p>
          <ul className="mb-3 list-disc pl-5">
            {unresolvedWarning.map((v, i) => (
              <li key={i}>{v.message}</li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="강제 확정 사유(감사로그에 기록됩니다)"
              className="flex-1 rounded-lg border border-amber-300 px-2 py-1"
            />
            <button
              type="button"
              disabled={!overrideReason || confirmMutation.isPending}
              onClick={() => confirmMutation.mutate({ override: true, overrideReason })}
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white disabled:opacity-40"
            >
              사유 기록 후 강제 확정
            </button>
            <button type="button" onClick={() => setUnresolvedWarning(null)} className="text-xs text-slate-500 underline">
              취소
            </button>
          </div>
        </div>
      )}

      {employeesQuery.isLoading || templatesQuery.isLoading || gridQuery.isLoading ? (
        <p className="text-slate-500">불러오는 중...</p>
      ) : employeesQuery.data && templatesQuery.data && gridQuery.data ? (
        <GridView
          employees={employeesQuery.data}
          days={days}
          rows={gridQuery.data.rows}
          templates={templatesQuery.data}
          armedTemplateId={armedTemplateId}
          pending={pending}
          onPendingChange={setPending}
        />
      ) : null}

      {conflicts && conflicts.length > 0 && (
        <ConflictDialog conflicts={conflicts} onApply={handleConflictApply} onCancel={() => setConflicts(null)} />
      )}
    </div>
  );
}
