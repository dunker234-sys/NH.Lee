import { useRef, useState } from 'react';
import { NumericKeypad } from '../components/NumericKeypad';
import type { PunchType } from './usePunchFlow';

type ActiveField = 'EMPLOYEE_NO' | 'PIN';

interface Props {
  submitting: boolean;
  onSubmit: (employeeNo: string, pin: string, punchType: PunchType) => void;
}

const MAX_PIN_LENGTH = 6;

/**
 * 완료조건4(2탭 이내)에 해당하는 STEP5-A의 "1탭" 설계와 달리, 키오스크는
 * 사번+PIN 입력이라는 요구사항 자체가 있어 탭 수 목표가 다르다 — 대신
 * 완료조건1(5초 이내)이 이 화면의 실제 성능 기준이다.
 *
 * 실제 브라우저에서 확인한 뒤 고친 지점: 사번을 숫자로만 가정하고 커스텀
 * 숫자 키패드만 유일한 입력수단으로 뒀더니 영숫자 사번(예: 실제 배포
 * 전까지 쓰는 테스트 계정)을 입력할 방법이 없었다 — 두 필드 모두 진짜
 * `<input>`으로 바꿔 하드웨어 키보드/OS 가상 키보드로도 입력 가능하게
 * 하고, 숫자 키패드는 포커스된 필드에 숫자를 보태주는 보조 수단으로
 * 남긴다(사번이 실제로 숫자 위주인 배포 환경에서는 여전히 키보드 없이도
 * 빠르게 끝난다).
 */
export function PunchEntryScreen({ submitting, onSubmit }: Props) {
  const [employeeNo, setEmployeeNo] = useState('');
  const [pin, setPin] = useState('');
  const [activeField, setActiveField] = useState<ActiveField>('EMPLOYEE_NO');
  const employeeNoRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  function handleDigit(digit: string) {
    if (activeField === 'EMPLOYEE_NO') {
      setEmployeeNo((v) => v + digit);
    } else if (pin.length < MAX_PIN_LENGTH) {
      setPin((v) => v + digit);
    }
  }

  function handleBackspace() {
    if (activeField === 'EMPLOYEE_NO') setEmployeeNo((v) => v.slice(0, -1));
    else setPin((v) => v.slice(0, -1));
  }

  function handleClear() {
    if (activeField === 'EMPLOYEE_NO') setEmployeeNo('');
    else setPin('');
  }

  function handlePunch(punchType: PunchType) {
    if (submitting || !employeeNo || pin.length < 4) return;
    onSubmit(employeeNo, pin, punchType);
    setEmployeeNo('');
    setPin('');
    setActiveField('EMPLOYEE_NO');
    employeeNoRef.current?.focus();
  }

  const canSubmit = employeeNo.length > 0 && pin.length >= 4 && !submitting;

  return (
    <div className="kiosk-app">
      <h1 className="kiosk-title">사번과 PIN을 입력하세요</h1>

      <div className="field-display-row">
        <div className="field-display">
          <label className="field-display__label" htmlFor="kiosk-employee-no">
            사번
          </label>
          <input
            id="kiosk-employee-no"
            ref={employeeNoRef}
            className={`field-display__value ${activeField === 'EMPLOYEE_NO' ? 'field-display__value--active' : ''}`}
            value={employeeNo}
            onChange={(e) => setEmployeeNo(e.target.value)}
            onFocus={() => setActiveField('EMPLOYEE_NO')}
            autoFocus
            inputMode="text"
            autoComplete="off"
          />
        </div>
        <div className="field-display">
          <label className="field-display__label" htmlFor="kiosk-pin">
            PIN
          </label>
          <input
            id="kiosk-pin"
            ref={pinRef}
            type="password"
            className={`field-display__value ${activeField === 'PIN' ? 'field-display__value--active' : ''}`}
            value={pin}
            onChange={(e) => setPin(e.target.value.slice(0, MAX_PIN_LENGTH))}
            onFocus={() => setActiveField('PIN')}
            inputMode="numeric"
            autoComplete="off"
            maxLength={MAX_PIN_LENGTH}
          />
        </div>
      </div>

      <NumericKeypad onDigit={handleDigit} onBackspace={handleBackspace} onClear={handleClear} />

      <div className="punch-type-row">
        <button type="button" className="punch-type-button" disabled={!canSubmit} onClick={() => handlePunch('IN')}>
          출근
        </button>
        <button
          type="button"
          className="punch-type-button punch-type-button--out"
          disabled={!canSubmit}
          onClick={() => handlePunch('OUT')}
        >
          퇴근
        </button>
      </div>
    </div>
  );
}
