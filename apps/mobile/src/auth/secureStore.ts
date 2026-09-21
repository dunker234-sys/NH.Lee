import * as SecureStore from 'expo-secure-store';

// expo-secure-store 하나만 감싸는 얇은 타입 래퍼 — 저장 키를 이 파일 한
// 곳에서만 나열해 오타로 인한 키 불일치를 막는다.
export const SECURE_STORE_KEYS = {
  deviceId: 'device_id_v1',
  refreshToken: 'refresh_token_v1',
  biometricEnrolled: 'biometric_enrolled_v1',
} as const;

export async function getSecureItem(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

export async function deleteSecureItem(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}
