import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class WeakPasswordError extends BadRequestException {
  constructor(message: string) {
    super({ code: 'WEAK_PASSWORD', message });
  }
}

/**
 * 비밀번호 정책 수치(최소 길이 등)는 policy_config가 아니라 런타임 설정값이다 —
 * CLAUDE.md 절대 규칙 4의 "법령 수치"는 근로기준법 등 노동관계법령 수치를
 * 말하며, 보안 정책은 성격이 다르다.
 */
@Injectable()
export class PasswordPolicyService {
  constructor(private readonly config: ConfigService) {}

  validate(password: string): void {
    const minLength = this.config.get<number>('auth.passwordMinLength', 10);
    const hasLetter = /[A-Za-z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);
    const varietyCount = [hasLetter, hasDigit, hasSpecial].filter(Boolean).length;

    if (password.length < minLength || varietyCount < 2) {
      throw new WeakPasswordError(
        `비밀번호는 ${minLength}자 이상이며 영문/숫자/특수문자 중 2종 이상을 포함해야 합니다.`,
      );
    }
  }
}
