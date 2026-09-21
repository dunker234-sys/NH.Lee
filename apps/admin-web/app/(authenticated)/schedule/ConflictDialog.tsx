'use client';

import { useState } from 'react';
import type { ScheduleConflict } from '../../../lib/api/scheduleApi';

export type ConflictResolution = 'mine' | 'theirs';

interface Props {
  conflicts: ScheduleConflict[];
  onApply: (resolutions: Map<string, ConflictResolution>) => void;
  onCancel: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  shiftTemplateId: '교대 패턴',
  plannedBreakMinutes: '휴게(분)',
  assignmentType: '투입 유형',
  status: '상태',
  version: '버전',
};

/** 낙관적 잠금 충돌(409) 시 "내 값/상대 값" 비교 UI. currentValue는 서버가
 * 409 응답에 이미 담아 보내므로 추가 왕복 없이 그린다. */
export function ConflictDialog({ conflicts, onApply, onCancel }: Props) {
  const [resolutions, setResolutions] = useState<Map<string, ConflictResolution>>(
    () => new Map(conflicts.map((c) => [c.scheduleId, 'theirs' as ConflictResolution])),
  );

  function setResolution(scheduleId: string, value: ConflictResolution) {
    setResolutions((prev) => new Map(prev).set(scheduleId, value));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-bold">저장 충돌</h2>
        <p className="mb-4 text-sm text-slate-500">
          다른 사용자가 먼저 저장한 셀이 있습니다. 셀마다 반영할 값을 선택하세요.
        </p>

        <div className="space-y-4">
          {conflicts.map((c) => (
            <div key={c.scheduleId} className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="mb-2 text-xs text-slate-500">스케줄 {c.scheduleId.slice(0, 8)}…</p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 has-[:checked]:border-blue-500 has-[:checked]:ring-1 has-[:checked]:ring-blue-500">
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name={`resolve-${c.scheduleId}`}
                      checked={resolutions.get(c.scheduleId) === 'mine'}
                      onChange={() => setResolution(c.scheduleId, 'mine')}
                    />
                    내 값
                  </span>
                  {Object.entries(FIELD_LABELS).map(([key, label]) =>
                    key in c.yourValue ? (
                      <span key={key} className="text-slate-600">
                        {label}: {String(c.yourValue[key])}
                      </span>
                    ) : null,
                  )}
                </label>
                <label className="flex cursor-pointer flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 has-[:checked]:border-blue-500 has-[:checked]:ring-1 has-[:checked]:ring-blue-500">
                  <span className="flex items-center gap-2 font-semibold">
                    <input
                      type="radio"
                      name={`resolve-${c.scheduleId}`}
                      checked={resolutions.get(c.scheduleId) === 'theirs'}
                      onChange={() => setResolution(c.scheduleId, 'theirs')}
                    />
                    상대 값
                  </span>
                  {c.currentValue &&
                    Object.entries(FIELD_LABELS).map(([key, label]) =>
                      key in c.currentValue! ? (
                        <span key={key} className="text-slate-600">
                          {label}: {String(c.currentValue![key])}
                        </span>
                      ) : null,
                    )}
                </label>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            취소
          </button>
          <button
            type="button"
            onClick={() => onApply(resolutions)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            선택한 값으로 재저장
          </button>
        </div>
      </div>
    </div>
  );
}
