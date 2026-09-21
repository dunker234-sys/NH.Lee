import { ConfigService } from '@nestjs/config';
import { ApiHrSourceAdapter } from './api-hr-source.adapter';
import { HrApiAuthStrategy } from '../auth-strategies/hr-api-auth-strategy.interface';

function fakeConfig(baseUrl: string | undefined): ConfigService {
  return { get: () => baseUrl } as unknown as ConfigService;
}

describe('ApiHrSourceAdapter — 완료조건: mock REST 응답 기반 테스트 통과 + 인증 플러그인화', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('인증 전략이 만든 헤더를 실어 REST 엔드포인트를 호출하고 결과를 매핑한다', async () => {
    const authStrategy: HrApiAuthStrategy = { getAuthHeaders: jest.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }) };
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          employeeNo: 'E20',
          name: '김철수',
          siteCode: 'SITE-A',
          hireDate: '2026-01-03',
          employmentType: 'CONTRACT',
          effectiveDate: '2026-01-01',
        },
      ],
    });
    global.fetch = mockFetch as unknown as typeof fetch;

    const adapter = new ApiHrSourceAdapter(fakeConfig('https://hr.internal.example'), authStrategy);
    const records = await adapter.fetchAll('2026-01-01');

    expect(authStrategy.getAuthHeaders).toHaveBeenCalled();
    const [calledUrl, calledInit] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain('/employees');
    expect(String(calledUrl)).toContain('asOfDate=2026-01-01');
    expect((calledInit.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
    expect(records).toEqual([
      expect.objectContaining({ employeeNo: 'E20', name: '김철수', employmentType: 'CONTRACT' }),
    ]);
  });

  it('HTTP 오류 응답이면 예외를 던진다', async () => {
    const authStrategy: HrApiAuthStrategy = { getAuthHeaders: jest.fn().mockResolvedValue({}) };
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

    const adapter = new ApiHrSourceAdapter(fakeConfig('https://hr.internal.example'), authStrategy);
    await expect(adapter.fetchAll('2026-01-01')).rejects.toThrow('HTTP 500');
  });

  it('BASE_URL 설정이 없으면 즉시 실패한다', async () => {
    const authStrategy: HrApiAuthStrategy = { getAuthHeaders: jest.fn() };
    const adapter = new ApiHrSourceAdapter(fakeConfig(undefined), authStrategy);
    await expect(adapter.fetchAll('2026-01-01')).rejects.toThrow('HR_SYNC_API_BASE_URL');
  });
});
