import * as LocalAuthentication from 'expo-local-authentication';
import { SECURE_STORE_KEYS, getSecureItem, setSecureItem } from './secureStore';

export async function isBiometricAvailable(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

export async function isBiometricEnrolledForApp(): Promise<boolean> {
  return (await getSecureItem(SECURE_STORE_KEYS.biometricEnrolled)) === 'true';
}

export async function setBiometricEnrolledForApp(enrolled: boolean): Promise<void> {
  await setSecureItem(SECURE_STORE_KEYS.biometricEnrolled, enrolled ? 'true' : 'false');
}

/**
 * 생체인증 성공은 로컬에 저장된 refreshToken을 "잠금 해제"할 뿐이다 — 서버는
 * 생체인증이라는 개념을 모르고 일반 POST /auth/refresh 호출로만 인식한다
 * (계획서 §7.3).
 */
export async function promptBiometric(reason: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({ promptMessage: reason, cancelLabel: undefined });
  return result.success;
}
