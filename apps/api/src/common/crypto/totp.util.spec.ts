import { generateTotp, generateTotpSecret, verifyTotp } from './totp.util';

describe('TOTP (RFC 6238 수동 구현)', () => {
  const secret = generateTotpSecret();
  const period = 30;
  const base = new Date('2026-01-01T00:00:00.000Z');

  it('생성한 시크릿은 40자리 hex(20바이트)다', () => {
    expect(secret).toMatch(/^[0-9a-f]{40}$/);
  });

  it('항상 6자리 숫자 문자열을 생성한다', () => {
    expect(generateTotp(secret, period, base)).toMatch(/^\d{6}$/);
  });

  it('같은 스텝(같은 30초 구간)에서는 항상 같은 코드를 생성한다', () => {
    const t1 = new Date(base.getTime() + 1000);
    const t2 = new Date(base.getTime() + 29000);
    expect(generateTotp(secret, period, t1)).toBe(generateTotp(secret, period, t2));
  });

  it('다음 스텝으로 넘어가면 코드가 달라진다', () => {
    const current = generateTotp(secret, period, base);
    const next = generateTotp(secret, period, new Date(base.getTime() + period * 1000));
    expect(current).not.toBe(next);
  });

  it('현재 스텝의 코드는 검증을 통과한다', () => {
    const code = generateTotp(secret, period, base);
    expect(verifyTotp(secret, period, code, base)).toBe(true);
  });

  it('±1 스텝(클록 드리프트)까지는 검증을 통과한다', () => {
    const prevStepCode = generateTotp(secret, period, new Date(base.getTime() - period * 1000));
    const nextStepCode = generateTotp(secret, period, new Date(base.getTime() + period * 1000));
    expect(verifyTotp(secret, period, prevStepCode, base)).toBe(true);
    expect(verifyTotp(secret, period, nextStepCode, base)).toBe(true);
  });

  it('2스텝 이상 벗어난 코드는 거부한다', () => {
    const farCode = generateTotp(secret, period, new Date(base.getTime() + 2 * period * 1000));
    expect(verifyTotp(secret, period, farCode, base)).toBe(false);
  });

  it('다른 시크릿으로 생성한 코드는 거부한다', () => {
    const otherSecret = generateTotpSecret();
    const code = generateTotp(otherSecret, period, base);
    expect(verifyTotp(secret, period, code, base)).toBe(false);
  });
});
