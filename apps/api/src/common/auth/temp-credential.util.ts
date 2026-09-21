import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const CREDENTIAL_BCRYPT_ROUNDS = 10;

/**
 * 관리자가 신규 계정을 만들 때(인사연동 신규입사자, 협력사 인력 수동등록)
 * 쓰는 임시 비밀번호 해시. 평문은 어디에도 남기지 않는다 — mustChangePassword
 * 기본값(true)이 첫 로그인 시 재설정을 강제한다(AuthService.changePassword()).
 */
export async function createTempPasswordHash(): Promise<string> {
  return bcrypt.hash(randomBytes(24).toString('hex'), CREDENTIAL_BCRYPT_ROUNDS);
}
