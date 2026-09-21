/**
 * 미저장 편집 버퍼. 서버 데이터(TanStack Query 캐시)와 분리해 둔다 —
 * "변경된 셀만 전송"의 자연스러운 소스이자, 409 충돌 시 "내 값"의 출처다.
 */

export interface PendingCell {
  employeeId: string;
  workDate: string; // YYYY-MM-DD
  /** 기존 행을 편집하는 경우만 채워진다. 빈 셀을 새로 채우는 경우 null. */
  scheduleId: string | null;
  expectedVersion: number | null;
  shiftTemplateId: string | null; // null = 휴무로 지움
}

export function cellKey(employeeId: string, workDate: string): string {
  return `${employeeId}:${workDate}`;
}

export type PendingCellMap = Map<string, PendingCell>;

export function setPendingCell(map: PendingCellMap, cell: PendingCell): PendingCellMap {
  const next = new Map(map);
  next.set(cellKey(cell.employeeId, cell.workDate), cell);
  return next;
}

export function clearPendingCells(): PendingCellMap {
  return new Map();
}
