import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { DeviceTokenPlatform, notificationApi } from '../api/notificationApi';

function toDeviceTokenPlatform(): DeviceTokenPlatform {
  if (Platform.OS === 'ios') return 'IOS';
  if (Platform.OS === 'android') return 'ANDROID';
  return 'WEB';
}

/**
 * CLAUDE.md 절대 규칙7: 이 앱은 device_token 등록만 한다 — 실제 발송(dedup·
 * 조용시간·다국어 포함)은 전부 서버 NotificationService가 한다. 앱 재설치는
 * 같은 (기기, 플랫폼)에서 새 토큰을 발급하므로 매 실행 호출이 안전하다
 * (device-token.repository.ts가 upsert).
 */
export async function registerPushToken(deviceId: string): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  let finalStatus = status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    finalStatus = req.status;
  }
  if (finalStatus !== 'granted') return;

  const tokenResponse = await Notifications.getExpoPushTokenAsync();
  await notificationApi.registerDeviceToken({
    deviceId,
    platform: toDeviceTokenPlatform(),
    token: tokenResponse.data,
  });
}

/** 앱 실행 중 OS가 토큰을 새로 발급하는 드문 경우(APNs 로테이션 등)도 재등록한다. */
export function watchPushTokenRotation(deviceId: string): () => void {
  const sub = Notifications.addPushTokenListener((event) => {
    notificationApi
      .registerDeviceToken({ deviceId, platform: toDeviceTokenPlatform(), token: event.data })
      .catch(() => {});
  });
  return () => sub.remove();
}
