import { AndroidIntegrityFlags, ClientPlatform, PunchType, RegistrationMethod } from '@attendance/shared-types';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { useLocationConsent } from '../consent/LocationConsentContext';
import { flushService } from '../offline/flush.service';
import { punchQueueRepository } from '../offline/punchQueue.repository';

const LOCATION_TIMEOUT_MS = 5000;

function currentPlatform(): ClientPlatform {
  if (Platform.OS === 'ios') return 'IOS';
  if (Platform.OS === 'android') return 'ANDROID';
  return 'OTHER';
}

async function tryGetLocation(): Promise<{ lat: number; lng: number; accuracyM: number } | undefined> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    let granted = status === 'granted';
    if (!granted) {
      const req = await Location.requestForegroundPermissionsAsync();
      granted = req.status === 'granted';
    }
    if (!granted) return undefined;

    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
    ]);
    if (!result) return undefined;
    return { lat: result.coords.latitude, lng: result.coords.longitude, accuracyM: result.coords.accuracy ?? 9999 };
  } catch {
    return undefined; // GPS 실패는 치명적이지 않다 — NFC/QR/키오스크가 대체수단이다.
  }
}

export interface PunchParams {
  punchType: PunchType;
  siteId: string;
  registrationMethod: RegistrationMethod;
  qrOrNfcToken?: string;
  androidIntegrityFlags?: AndroidIntegrityFlags;
}

/**
 * 계획서 §3.2의 정확한 순서를 구현한다: recordedAt 1회 확정 → (GPS 방식이고
 * 동의가 있을 때만) 위치 시도 → 네트워크 시도 전에 SQLite INSERT → flush
 * 트리거 → 낙관적 완료 피드백. 이 순서(3번이 네트워크보다 먼저)가
 * 완료조건1의 핵심이다.
 */
export function usePunchAction() {
  const { principal, deviceId } = useAuth();
  const { canUseGps } = useLocationConsent();

  async function punch(params: PunchParams): Promise<void> {
    const recordedAt = new Date().toISOString(); // 1. 최초 1회만 확정, 이후 재전송에서 절대 재계산하지 않는다.

    const location =
      params.registrationMethod === 'GPS' && canUseGps ? await tryGetLocation() : undefined; // 2.

    await punchQueueRepository.enqueue({
      employeeId: principal!.employeeId,
      punchType: params.punchType,
      recordedAt,
      siteId: params.siteId,
      location,
      registrationMethod: params.registrationMethod,
      deviceId,
      qrOrNfcToken: params.qrOrNfcToken,
      platform: currentPlatform(),
      androidIntegrityFlags: params.androidIntegrityFlags,
    }); // 3. 네트워크 시도 전 커밋.

    flushService.trigger(); // 4.

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); // 5. 낙관적 완료 피드백.
  }

  return { punch };
}
