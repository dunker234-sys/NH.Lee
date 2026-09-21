import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// 사업장 QR TOTP 공유키처럼, 평문 유출 시 그 사업장 전체를 무기한 위조할 수
// 있는 값을 저장하기 위한 AES-256-GCM 대칭키 암복호화. 저장 형식은
// hex(iv[12] + authTag[16] + ciphertext) 한 문자열이다.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('hex');
}

export function decrypt(encryptedHex: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const data = Buffer.from(encryptedHex, 'hex');
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
