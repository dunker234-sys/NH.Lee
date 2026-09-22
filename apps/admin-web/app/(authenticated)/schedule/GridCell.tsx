'use client';

interface Props {
  label: string; // 표시할 교대 패턴 축약명 (또는 '')
  timeLabel?: string; // 출퇴근 시간(예: "05:00~14:00"), 패턴이 없으면 undefined
  confirmed: boolean;
  pending: boolean; // 아직 저장 안 된 로컬 변경
  selected: boolean; // 드래그 선택 중인 셀
  onMouseDown: () => void;
  onMouseEnter: () => void;
}

/** 그리드 셀 하나. 네이티브 <select>가 아니라 클릭/드래그 대상 <div>다 —
 * <select>는 mousedown에서 자체 드롭다운을 열어버려 드래그-채우기 제스처와
 * 충돌한다(GridView.tsx 참고). 값 선택은 툴바의 "채우기 값"에서 미리
 * 고른다. 출퇴근 시간(timeLabel)을 패턴명 아래 작은 글씨로 함께 보여준다
 * (수정사항: 출근/퇴근 시간 구분 표시). */
export function GridCell({ label, timeLabel, confirmed, pending, selected, onMouseDown, onMouseEnter }: Props) {
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      className={`flex h-12 min-w-[76px] cursor-pointer select-none flex-col items-center justify-center rounded border text-xs leading-tight ${
        selected
          ? 'border-blue-500 bg-blue-100'
          : pending
            ? 'border-amber-400 bg-amber-50'
            : confirmed
              ? 'border-slate-200 bg-slate-50'
              : 'border-slate-200 bg-white'
      }`}
      title={confirmed ? '확정됨' : pending ? '저장 대기 중' : undefined}
    >
      <span>{label}</span>
      {timeLabel && <span className="text-[10px] text-slate-500">{timeLabel}</span>}
    </div>
  );
}
