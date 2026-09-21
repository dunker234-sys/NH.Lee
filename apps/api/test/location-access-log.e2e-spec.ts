import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './setup/app';
import { resetDatabase } from './setup/db';
import { login } from './setup/auth-helper';
import { Fixture, loadFixture } from './fixtures';

/**
 * STEP5-A: GET /location-access-log — 위치정보법 §16조②/§24조③ 확인자료 열람.
 *
 * 알려진 갭(계획서 §9.4): location_access_log에 실제로 쓰는 코드가 이
 * 저장소 어디에도 아직 없다(관리자·시스템의 위치 조회 지점을 계측하는
 * 별도 작업이 필요, 이번 STEP 범위 밖). 그래서 이 테스트는 읽기
 * 엔드포인트의 형태(빈 목록 응답, self-scoped)만 검증할 수 있다 — 실제
 * 행이 쌓인 뒤의 커서 페이지네이션·타 직원 비노출 검증은 쓰기 경로가
 * 생기는 후속 작업에서 alert-log.e2e-spec.ts와 같은 패턴으로 추가한다.
 */
describe('GET /location-access-log — 본인 위치정보 확인자료 열람', () => {
  let app: INestApplication;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await loadFixture();
    app = await createTestApp();
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('쓰기 경로가 아직 없으므로 빈 목록을 반환한다(self-scoped 형태만 검증)', async () => {
    const { accessToken } = await login(app, fixture.employees.plainEmployeeA.employeeNo, fixture.password, 'dev-loc-log-1');
    const res = await request(app.getHttpServer())
      .get('/location-access-log')
      .set({ Authorization: `Bearer ${accessToken}` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], hasMore: false });
  });
});
