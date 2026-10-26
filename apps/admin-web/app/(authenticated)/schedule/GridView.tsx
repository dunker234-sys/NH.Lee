'use client';

import { useEffect, useRef, useState } from 'react';
import type { EmployeeSummary } from '../../../lib/api/employeesApi';
import type { ScheduleRow, ShiftTemplate } from '../../../lib/api/scheduleApi';
import { cellKey, PendingCellMap, setPendingCell } from '../../../lib/schedule/gridState';
import { GridCell } from './GridCell';

interface Props {
  employees: EmployeeSummary[];
  days: string[];
  rows: ScheduleRow[];
  templates: ShiftTemplate[];
  armedTemplateId: string | null;
  pending: PendingCellMap;
  onPendingChange: (next: PendingCellMap) => void;
}

/** 월간 그리드. 드래그-채우기: mousedown으로 시작 셀+드래그 상태 기록 →
 * mouseenter로 같은 행(직원) 안에서 선택 범위 확장 → mouseup에 툴바에서
 * 고른 "채우기 값"을 그 범위 전체에 복사한다. 별도 DnD 라이브러리를
 * 쓰지 않는다 — 컨테이너 간 이동이 아니라 스프레드시트형 채우기 핸들
 * 동작이라 그 문제와 다르다. */
export function GridView({ employees, days, rows, templates, armedTemplateId, pending, onPendingChange }: Props) {
  const [drag, setDrag] = useState<{ employeeId: string; startIdx: number; curIdx: number } | null>(null);
  // 이벤트 핸들러(mouseup 등)가 항상 최신 값을 읽도록 렌더 이후에 ref를 갱신한다
  // (렌더 중 ref 쓰기는 금지 — react-hooks/refs).
  const dragRef = useRef(drag);
  const armedRef = useRef(armedTemplateId);
  useEffect(() => {
    dragRef.current = drag;
    armedRef.current = armedTemplateId;
  });

  const rowsByKey = new Map<string, ScheduleRow>();
  for (const r of rows) rowsByKey.set(cellKey(r.employeeId, r.workDate.slice(0, 10)), r);
  const templateById = new Map(templates.map((t) => [t.id, t]));

  function templateLabel(id: string | null): string {
    if (!id) return '';
    const t = templateById.get(id);
    return t ? t.name.slice(0, 4) : '?';
  }

  function templateTimeLabel(id: string | null): string | undefined {
    if (!id) return undefined;
    const t = templateById.get(id);
    return t ? `${t.startTime}~${t.endTime}` : undefined;
  }

  function applyRange(employeeId: string, fromIdx: number, toIdx: number) {
    if (!armedRef.current) return;
    const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    let next = pending;
    for (let i = lo; i <= hi; i++) {
      const workDate = days[i];
      const existing = rowsByKey.get(cellKey(employeeId, workDate));
      next = setPendingCell(next, {
        employeeId,
        workDate,
        scheduleId: existing?.id ?? null,
        expectedVersion: existing?.version ?? null,
        shiftTemplateId: armedRef.current,
      });
    }
    onPendingChange(next);
  }

  useEffect(() => {
    function onUp() {
      const d = dragRef.current;
      if (d) applyRange(d.employeeId, d.startIdx, d.curIdx);
      setDrag(null);
    }
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, days, rows, templates]);

  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 min-w-[120px] bg-white text-left text-xs font-semibold text-slate-500">
              직원
            </th>
            {days.map((d) => (
              <th key={d} className="min-w-[64px] text-xs font-normal text-slate-500">
                {Number(d.slice(8, 10))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id}>
              <td className="sticky left-0 z-10 bg-white text-sm font-medium text-slate-700">
                {emp.name}
                <span className="ml-1 text-xs text-slate-400">({emp.employeeNo})</span>
              </td>
              {days.map((d, idx) => {
                const key = cellKey(emp.id, d);
                const pendingCell = pending.get(key);
                const existing = rowsByKey.get(key);
                const activeTemplateId = pendingCell ? pendingCell.shiftTemplateId : (existing?.shiftTemplateId ?? null);
                const label = templateLabel(activeTemplateId);
                const timeLabel = templateTimeLabel(activeTemplateId);
                const selected = drag?.employeeId === emp.id && idx >= Math.min(drag.startIdx, drag.curIdx) && idx <= Math.max(drag.startIdx, drag.curIdx);
                return (
                  <td key={d}>
                    <GridCell
                      label={label}
                      timeLabel={timeLabel}
                      confirmed={existing?.status === 'CONFIRMED'}
                      pending={Boolean(pendingCell)}
                      selected={Boolean(selected)}
                      onMouseDown={() => setDrag({ employeeId: emp.id, startIdx: idx, curIdx: idx })}
                      onMouseEnter={() => setDrag((prev) => (prev && prev.employeeId === emp.id ? { ...prev, curIdx: idx } : prev))}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
