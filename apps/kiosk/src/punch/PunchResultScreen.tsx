import type { PunchFlowState } from './usePunchFlow';

const PUNCH_TYPE_LABEL: Record<string, string> = {
  IN: '출근',
  OUT: '퇴근',
  BREAK_OUT: '휴게 시작',
  BREAK_IN: '휴게 종료',
};

interface Props {
  state: Extract<PunchFlowState, { phase: 'RESULT' }>;
}

/**
 * 완료 화면 — 3초 후 자동 초기화는 usePunchFlow.ts가 타이머로 처리한다
 * (이 컴포넌트는 순수 표시). 개인정보 노출 최소화: 마스킹된 이름 외에는
 * 아무것도 보여주지 않는다(근태 상세 없음).
 */
export function PunchResultScreen({ state }: Props) {
  if (state.outcome === 'ONLINE_SUCCESS') {
    return (
      <div className="result-screen">
        <div className="result-screen__icon">✅</div>
        <div className="result-screen__title">
          {state.maskedName}님 {PUNCH_TYPE_LABEL[state.punchType]} 완료
        </div>
      </div>
    );
  }

  if (state.outcome === 'OFFLINE_SAVED') {
    return (
      <div className="result-screen result-screen--offline">
        <div className="result-screen__icon">📶</div>
        <div className="result-screen__title">{PUNCH_TYPE_LABEL[state.punchType]} 저장됨(확인 대기)</div>
        <div className="result-screen__detail">네트워크가 복구되면 자동으로 전송됩니다.</div>
      </div>
    );
  }

  return (
    <div className="result-screen result-screen--error">
      <div className="result-screen__icon">⚠️</div>
      <div className="result-screen__title">처리되지 않았습니다</div>
      <div className="result-screen__detail">{state.message}</div>
    </div>
  );
}
