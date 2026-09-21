/**
 * 오프라인 큐에 PIN을 잠깐 담아둬야 할 때(계획서 §7.2 — 키오스크는 오프라인
 * 중 PIN을 서버에 검증받을 방법이 전혀 없다) 최소한의 눈가림을 제공한다.
 * **강한 암호화가 아니다** — 복호화 키가 기기 자격증명에서 유도되는데 그
 * 자격증명도 같은 localStorage에 있으니, 로컬 저장소 자체를 통째로
 * 탈취당하면 의미가 없다. 실질적 방어선은 재연결 시 서버가 PIN을 실제로
 * 재검증하고 잠금 로직이 그대로 적용된다는 것이다(§10-3, 알려진 갭으로
 * 문서화됨).
 */

async function deriveKey(deviceCredential: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceCredential));
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 반환값: "base64(iv):base64(ciphertext)" */
export async function encryptPin(pin: string, deviceCredential: string): Promise<string> {
  const key = await deriveKey(deviceCredential);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(pin));
  return `${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptPin(payload: string, deviceCredential: string): Promise<string> {
  const [ivB64, ciphertextB64] = payload.split(':');
  const key = await deriveKey(deviceCredential);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivB64) },
    key,
    fromBase64(ciphertextB64),
  );
  return new TextDecoder().decode(plaintext);
}
