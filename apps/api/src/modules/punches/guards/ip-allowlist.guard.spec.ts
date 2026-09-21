import { ExecutionContext } from '@nestjs/common';
import { IpAllowlistGuard } from './ip-allowlist.guard';

function makeContext(body: unknown, ip: string): ExecutionContext {
  const request = { body, ip };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

/**
 * HTTP 없이 가짜 ExecutionContext로 직접 호출한다 — supertest는 항상
 * 루프백 주소로만 오므로, 임의의 외부 IP에 대한 허용/차단 분기는 이
 * 계층에서만 결정적으로 검증할 수 있다(테스트만을 위해 가드에 "테스트
 * 모드 헤더 신뢰" 같은 프로덕션 코드 분기를 추가하지 않는다).
 */
describe('IpAllowlistGuard', () => {
  function makePrismaStub(rows: { siteId: string; cidr: string; active: boolean }[]) {
    return {
      siteIpAllowlist: {
        findMany: jest.fn(({ where }: { where: { siteId: string; active: boolean } }) =>
          Promise.resolve(rows.filter((r) => r.siteId === where.siteId && r.active === where.active)),
        ),
      },
    } as never;
  }

  it('registrationMethod가 PC가 아니면 허용목록을 조회하지 않고 통과시킨다', async () => {
    const prisma = makePrismaStub([]);
    const guard = new IpAllowlistGuard(prisma);
    const context = makeContext({ registrationMethod: 'GPS', siteId: 'site-1' }, '203.0.113.9');
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect((prisma as never as { siteIpAllowlist: { findMany: jest.Mock } }).siteIpAllowlist.findMany).not.toHaveBeenCalled();
  });

  it('허용목록에 포함된 IP는 통과한다', async () => {
    const prisma = makePrismaStub([{ siteId: 'site-1', cidr: '203.0.113.0/24', active: true }]);
    const guard = new IpAllowlistGuard(prisma);
    const context = makeContext({ registrationMethod: 'PC', siteId: 'site-1' }, '203.0.113.9');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('허용목록 밖 IP는 IP_NOT_ALLOWED로 거부된다', async () => {
    const prisma = makePrismaStub([{ siteId: 'site-1', cidr: '203.0.113.0/24', active: true }]);
    const guard = new IpAllowlistGuard(prisma);
    const context = makeContext({ registrationMethod: 'PC', siteId: 'site-1' }, '198.51.100.9');
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'IP_NOT_ALLOWED' },
    });
  });

  it('사업장에 허용목록이 하나도 없으면 fail-closed로 거부한다', async () => {
    const prisma = makePrismaStub([]);
    const guard = new IpAllowlistGuard(prisma);
    const context = makeContext({ registrationMethod: 'PC', siteId: 'site-no-allowlist' }, '203.0.113.9');
    await expect(guard.canActivate(context)).rejects.toMatchObject({ response: { code: 'IP_NOT_ALLOWED' } });
  });

  it('벌크 요청은 items 중 PC 항목의 siteId 허용목록을 검사한다', async () => {
    const prisma = makePrismaStub([{ siteId: 'site-1', cidr: '203.0.113.0/24', active: true }]);
    const guard = new IpAllowlistGuard(prisma);
    const context = makeContext(
      { items: [{ registrationMethod: 'GPS', siteId: 'site-x' }, { registrationMethod: 'PC', siteId: 'site-1' }] },
      '203.0.113.9',
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('::ffff: IPv4-매핑 IPv6 표현도 정규화해 판정한다', async () => {
    const prisma = makePrismaStub([{ siteId: 'site-1', cidr: '203.0.113.0/24', active: true }]);
    const guard = new IpAllowlistGuard(prisma);
    const context = makeContext({ registrationMethod: 'PC', siteId: 'site-1' }, '::ffff:203.0.113.9');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('순수 IPv6 루프백(::1)은 127.0.0.1로 취급한다 — 실제 브라우저 테스트에서 localhost가 ::1로 해석되는 경우를 확인했다', async () => {
    const prisma = makePrismaStub([{ siteId: 'site-1', cidr: '127.0.0.1/32', active: true }]);
    const guard = new IpAllowlistGuard(prisma);
    const context = makeContext({ registrationMethod: 'PC', siteId: 'site-1' }, '::1');
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
