import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScopeRequiredError } from '../../common/scope/scope.util';
import { EmployeesRepository } from './employees.repository';

describe('EmployeesRepository.findMany — 완료조건: 스코프 미지정 시 런타임 에러', () => {
  it('scope 없이 호출하면 DB에 닿기 전에 예외를 던진다', async () => {
    // PrismaService를 실제로 만들지 않는다 — assertScope가 던지면 그 전에 실패해야
    // 이 테스트가 "가드를 거치지 않은 직접 호출"을 정확히 흉내낸다.
    const repo = new EmployeesRepository({} as PrismaService);

    await expect(repo.findMany(undefined as never)).rejects.toThrow(OrgScopeRequiredError);
    await expect(repo.findMany(null as never)).rejects.toThrow(OrgScopeRequiredError);
  });
});
