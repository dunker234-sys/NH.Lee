import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('상태 외의 정보는 반환하지 않는다', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
