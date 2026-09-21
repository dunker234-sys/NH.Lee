import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { flushService } from './flush.service';

let unsubscribe: (() => void) | null = null;
let wasConnected = true;

/** 오프라인→온라인 전환에서만 flush를 트리거한다(매 상태 변화마다가 아니라). */
function handleChange(state: NetInfoState): void {
  const isConnected = Boolean(state.isConnected && state.isInternetReachable !== false);
  if (isConnected && !wasConnected) flushService.trigger();
  wasConnected = isConnected;
}

/** App.tsx 마운트 시 1회 호출. 완료조건1의 "비행기모드 해제" 트리거가 바로 이 리스너다. */
export function startNetworkWatcher(): void {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener(handleChange);
}

export function stopNetworkWatcher(): void {
  unsubscribe?.();
  unsubscribe = null;
}
