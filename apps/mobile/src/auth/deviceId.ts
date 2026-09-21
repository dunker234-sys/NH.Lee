import * as Crypto from 'expo-crypto';
import { SECURE_STORE_KEYS, getSecureItem, setSecureItem } from './secureStore';

let cached: string | null = null;

/**
 * 서버 멱등키(sha256(사번|타입|분단위절삭(recordedAt)|deviceId))의 구성요소이자
 * DeviceBindingService의 신뢰 판정 기준이라 최초 생성 후 절대 재생성하지
 * 않는다. expo-application의 vendor/Android ID는 의도적으로 쓰지 않는다 —
 * iOS identifierForVendor는 해당 벤더의 마지막 앱 삭제 시 초기화되고,
 * Android ID는 앱마다 값이 달라질 수 있어 오히려 덜 안정적이다.
 *
 * iOS/Android 비대칭(계획서 §7.1): iOS Keychain은 재설치 후에도 보통 값이
 * 유지되지만, Android의 expo-secure-store는 SharedPreferences+Keystore
 * 기반이라 재설치 시 소실되어 새 deviceId가 생성된다 — 재설치한 Android
 * 사용자는 재신뢰 획득 전까지 verificationLevel:'LOW'로 기록된다. 완료조건1
 * (강제종료→재실행)은 재설치가 아니므로 이 비대칭과 무관하다.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cached) return cached;
  const existing = await getSecureItem(SECURE_STORE_KEYS.deviceId);
  if (existing) {
    cached = existing;
    return existing;
  }
  const generated = Crypto.randomUUID();
  await setSecureItem(SECURE_STORE_KEYS.deviceId, generated);
  cached = generated;
  return generated;
}
