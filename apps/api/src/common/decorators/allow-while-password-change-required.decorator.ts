import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHILE_PASSWORD_CHANGE_REQUIRED_KEY = 'allowWhilePasswordChangeRequired';

/**
 * mustChangePassword=true인 계정도 호출할 수 있는 라우트로 표시한다
 * (비밀번호 변경, 세션 조회, 로그아웃 등). 그 외 라우트는 전부 403(MUST_CHANGE_PASSWORD).
 */
export const AllowWhilePasswordChangeRequired = () =>
  SetMetadata(ALLOW_WHILE_PASSWORD_CHANGE_REQUIRED_KEY, true);
