import { decryptPin, encryptPin } from '../pinCipher';

describe('pinCipher', () => {
  it('암호화한 값을 같은 기기 자격증명으로 복호화하면 원본 PIN이 나온다', async () => {
    const encrypted = await encryptPin('1234', 'device-credential-abc');
    const decrypted = await decryptPin(encrypted, 'device-credential-abc');
    expect(decrypted).toBe('1234');
  });

  it('암호문에는 평문 PIN이 그대로 노출되지 않는다', async () => {
    const encrypted = await encryptPin('9999', 'device-credential-abc');
    expect(encrypted).not.toContain('9999');
  });

  it('다른 기기 자격증명으로는 복호화가 실패한다(다른 키로 유도됨)', async () => {
    const encrypted = await encryptPin('4321', 'device-credential-abc');
    await expect(decryptPin(encrypted, 'device-credential-different')).rejects.toThrow();
  });

  it('같은 PIN이라도 매번 다른 암호문을 생성한다(무작위 IV)', async () => {
    const first = await encryptPin('1234', 'device-credential-abc');
    const second = await encryptPin('1234', 'device-credential-abc');
    expect(first).not.toBe(second);
  });
});
