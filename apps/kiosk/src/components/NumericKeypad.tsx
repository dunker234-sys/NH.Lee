interface NumericKeypadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear: () => void;
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** 하드웨어 키보드 없는 태블릿 전제 — 큰 터치 타깃(≥64px), 대기줄 상황을
 * 고려해 사번/PIN 입력 모두 이 키패드 하나로 처리한다. */
export function NumericKeypad({ onDigit, onBackspace, onClear }: NumericKeypadProps) {
  return (
    <div className="numeric-keypad">
      {DIGITS.map((d) => (
        <button key={d} type="button" className="numeric-keypad__key" onClick={() => onDigit(d)}>
          {d}
        </button>
      ))}
      <button type="button" className="numeric-keypad__key numeric-keypad__key--muted" onClick={onClear}>
        전체삭제
      </button>
      <button type="button" className="numeric-keypad__key" onClick={() => onDigit('0')}>
        0
      </button>
      <button type="button" className="numeric-keypad__key numeric-keypad__key--muted" onClick={onBackspace}>
        ⌫
      </button>
    </div>
  );
}
