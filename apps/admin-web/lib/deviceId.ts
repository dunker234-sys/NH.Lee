const KEY = 'admin_web_device_id_v1';

/** 로그인·타각 양쪽에 같은 값을 재사용해야 한다(계획서 §8) — 매번 새로
 * 생성하면 DeviceBindingService가 매 방문을 "새 기기"로 봐서 계속 LOW로
 * 남는다. */
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server';
  const existing = localStorage.getItem(KEY);
  if (existing) return existing;
  const generated = crypto.randomUUID();
  localStorage.setItem(KEY, generated);
  return generated;
}
