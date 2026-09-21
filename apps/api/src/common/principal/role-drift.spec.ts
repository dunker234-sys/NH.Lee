import { EmployeeRole as PrismaEmployeeRole } from '@prisma/client';
import { EMPLOYEE_ROLES } from '@attendance/shared-types';

/**
 * packages/shared-types는 프런트에서 @prisma/client를 못 쓰니 EmployeeRole
 * 값을 손으로 복제해 둔다. 손복제는 드리프트(스키마가 바뀌었는데 shared-types가
 * 안 바뀜) 위험이 있어, 여기서 매번 실제 Prisma enum과 비교해 어긋나면 빌드가
 * 깨지게 한다.
 */
describe('EmployeeRole drift', () => {
  it('shared-types의 EMPLOYEE_ROLES가 Prisma EmployeeRole enum과 정확히 일치한다', () => {
    const prismaValues = Object.values(PrismaEmployeeRole).sort();
    const sharedValues = [...EMPLOYEE_ROLES].sort();
    expect(sharedValues).toEqual(prismaValues);
  });
});
