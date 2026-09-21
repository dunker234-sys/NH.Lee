'use client';

interface Props {
  label: string; // 표시할 텍스트(교대 패턴 축약명 또는 '')
  confirmed: boolean;
  pending: boolean; // 아직 저장 안 된 로컬 변경
  selected: boolean; // 드래그 선택 중인 셀
  onMouseDown: () => void;
  onMouseEnter: () => void;
}

/** 그리드 셀 하나. 네이티브 <select>가 아니라 클릭/드래그 대상 <div>다 —
 * <select>는 mousedown에서 자체 드롭다운을 열어버려 드래그-채우기 제스처와
 * 충돌한다(GridView.tsx 참고). 값 선택은 툴바의 "채우기 값"에서 미리
 * 고른다. */
export function GridCell({ label, confirmed, pending, selected, onMouseDown, onMouseEnter }: Props) {
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      className={`flex h-10 min-w-[64px] cursor-pointer select-none items-center justify-center rounded border text-xs ${
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
      {label}
    </div>
  );
}
