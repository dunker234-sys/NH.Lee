/**
 * apps/api/prisma/schema.prisma의 EmployeeRole enum을 손으로 미러링한다.
 * 프런트(admin-web/mobile/kiosk)는 @prisma/client를 직접 import할 수 없어
 * 여기서 값을 복제해 둔다. 드리프트(값이 실제 스키마와 어긋나는 것)를 놓치지
 * 않도록 apps/api 쪽에 이 배열과 Prisma enum을 비교하는 테스트가 있다
 * (src/common/principal/role-drift.spec.ts) — enum을 바꾸면 그 테스트가 실패한다.
 */
export const EMPLOYEE_ROLES = ['EMPLOYEE', 'SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN', 'PARTNER'] as const;

export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];
