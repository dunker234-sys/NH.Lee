import * as Notifications from 'expo-notifications';
import { AppState, AppStateStatus } from 'react-native';
import { queueEvents } from '../offline/queueEvents';
import { punchQueueRepository } from '../offline/punchQueue.repository';

// CLAUDE.md 절대 규칙7 저촉 여부(계획서 §4의 결론을 그대로 코드에 남긴다):
// 규칙7은 "FCM/APNs를 개별 기능에서 직접 호출하지 않는다"를 명시적으로
// 겨냥한다 — 즉 서버발 원격 푸시 게이트웨이. 아래 scheduleNotificationAsync는
// trigger:null로 예약하는 순수 로컬 알림이라 네트워크도, FCM/APNs도, 서버도
// 거치지 않고 이 기기에만 표시된다. 수신자가 이 기기 하나뿐이라 dedup/
// 조용시간/다국어 같은 NotificationService가 막으려는 문제 자체가 생기지
// 않는다 — 규칙7의 적용 범위 밖으로 판단한다.

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

async function syncBadge(): Promise<void> {
  const count = await punchQueueRepository.countPending();
  await Notifications.setBadgeCountAsync(count);
}

async function notifyIfPendingOnBackground(nextState: AppStateStatus): Promise<void> {
  if (nextState !== 'background' && nextState !== 'inactive') return;
  const count = await punchQueueRepository.countPending();
  if (count === 0) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '전송 대기 중인 타각이 있습니다',
      body: `타각 ${count}건이 아직 전송되지 않았습니다 — 앱을 열어 확인하세요.`,
    },
    trigger: null,
  });
}

let started = false;

/** App.tsx 마운트 시 1회 호출. */
export function startLocalNotificationWatcher(): () => void {
  if (started) return () => {};
  started = true;

  syncBadge();
  const unsubscribeQueue = queueEvents.subscribe(() => {
    syncBadge();
  });
  const appStateSub = AppState.addEventListener('change', notifyIfPendingOnBackground);

  return () => {
    started = false;
    unsubscribeQueue();
    appStateSub.remove();
  };
}
