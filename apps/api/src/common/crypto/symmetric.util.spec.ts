import { randomBytes } from 'crypto';
import { decrypt, encrypt } from './symmetric.util';

describe('symmetric.util (AES-256-GCM)', () => {
  const key = randomBytes(32).toString('hex');

  it('암호화한 값을 같은 키로 복호화하면 원문이 나온다', () => {
    const plaintext = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    const encrypted = encrypt(plaintext, key);
    expect(decrypt(encrypted, key)).toBe(plaintext);
  });

  it('같은 평문을 두 번 암호화하면 IV가 달라 암호문도 달라진다', () => {
    const plaintext = 'same-secret';
    expect(encrypt(plaintext, key)).not.toBe(encrypt(plaintext, key));
  });

  it('다른 키로 복호화하면 인증 태그 검증에 실패해 예외를 던진다', () => {
    const encrypted = encrypt('secret-value', key);
    const wrongKey = randomBytes(32).toString('hex');
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  it('암호문이 변조되면 인증 태그 검증에 실패해 예외를 던진다', () => {
    const encrypted = encrypt('secret-value', key);
    const tampered = encrypted.slice(0, -2) + (encrypted.slice(-2) === '00' ? '11' : '00');
    expect(() => decrypt(tampered, key)).toThrow();
  });
});
