import { SetMetadata } from '@nestjs/common';
import { EmployeeRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/** 역할 게이트 — 조직 스코프 필터와는 별개의 축이다("역할 × 스코프" 이중 필터). */
export const Roles = (...roles: EmployeeRole[]) => SetMetadata(ROLES_KEY, roles);
