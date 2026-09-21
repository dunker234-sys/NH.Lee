import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** JwtAuthGuard/PrincipalGuard/RolesGuard를 전부 우회한다 (로그인, 리프레시 등). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
