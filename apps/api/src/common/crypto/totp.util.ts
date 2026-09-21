import { createHmac, randomBytes } from 'crypto';

// RFC 6238(TOTP) / RFC 4226(HOTP) 수동 구현. otplib/speakeasy 등 어떤 TOTP
// 라이브러리도 이 저장소에 설치돼 있지 않고, 주기(qr_totp_period_seconds)가
// policy_config로 30~60초 범위에서 가변이어야 해서 라이브러리 기본값에 맞추기보다
// 직접 구현이 더 명확하다. 시크릿은 hex 문자열로 저장·전달한다(QR 코드 노출용
// base32/otpauth URI 인코딩은 이번 STEP 범위 밖 — admin-web 관리 화면이 없다).

export function generateTotpSecret(): string {
  return randomBytes(20).toString('hex');
}

function hotp(secretHex: string, counter: number): string {
  const key = Buffer.from(secretHex, 'hex');
  const counterBuf = Buffer.alloc(8);
  // 64비트 빅엔디안 카운터. JS 숫자는 53비트까지 안전 — 초 단위 카운터가
  // 그 한계에 도달하려면 약 2.85억 년이 걸려 실무상 문제되지 않는다.
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter % 0x100000000, 4);

  const hmac = createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return (binCode % 1000000).toString().padStart(6, '0');
}

function stepOf(periodSeconds: number, at: Date): number {
  return Math.floor(at.getTime() / 1000 / periodSeconds);
}

export function generateTotp(secretHex: string, periodSeconds: number, at: Date = new Date()): string {
  return hotp(secretHex, stepOf(periodSeconds, at));
}

/** 클록 드리프트를 흡수하기 위해 현재 스텝 ±1까지 허용한다. */
export function verifyTotp(
  secretHex: string,
  periodSeconds: number,
  submittedCode: string,
  at: Date = new Date(),
): boolean {
  const currentStep = stepOf(periodSeconds, at);
  for (const delta of [0, -1, 1]) {
    if (hotp(secretHex, currentStep + delta) === submittedCode) return true;
  }
  return false;
}
