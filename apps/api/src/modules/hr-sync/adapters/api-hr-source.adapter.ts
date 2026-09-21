import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HrSourceAdapter, StandardHrRecord } from '../hr-sync.types';
import { HR_API_AUTH_STRATEGY, HrApiAuthStrategy } from '../auth-strategies/hr-api-auth-strategy.interface';

interface ApiHrRecordResponse {
  employeeNo: string;
  name: string;
  siteCode: string;
  department?: string;
  jobTitle?: string;
  hireDate: string;
  resignationDate?: string;
  employmentType: string;
  contractedWorkMinutes?: number;
  managerEmployeeNo?: string;
  effectiveDate: string;
}

/**
 * ApiAdapter: REST 엔드포인트에서 전 직원 스냅샷을 받아온다. 신규
 * 의존성을 추가하지 않기 위해 Node 내장 fetch를 쓴다. 인증 방식은
 * HrApiAuthStrategy 플러그인(HR_API_AUTH_STRATEGY 토큰)이 결정한다.
 */
@Injectable()
export class ApiHrSourceAdapter implements HrSourceAdapter {
  constructor(
    private readonly config: ConfigService,
    @Inject(HR_API_AUTH_STRATEGY) private readonly authStrategy: HrApiAuthStrategy,
  ) {}

  async fetchAll(asOfDate: string): Promise<StandardHrRecord[]> {
    const baseUrl = this.config.get<string>('hrSync.api.baseUrl');
    if (!baseUrl) {
      throw new Error('HR_SYNC_API_BASE_URL이 설정되지 않았습니다.');
    }
    const authHeaders = await this.authStrategy.getAuthHeaders();

    const url = new URL('/employees', baseUrl);
    url.searchParams.set('asOfDate', asOfDate);
    const response = await fetch(url, { headers: { Accept: 'application/json', ...authHeaders } });
    if (!response.ok) {
      throw new Error(`인사시스템 API 호출 실패: HTTP ${response.status}`);
    }
    const body = (await response.json()) as ApiHrRecordResponse[];
    return body.map((r) => ({
      employeeNo: r.employeeNo,
      name: r.name,
      siteCode: r.siteCode,
      department: r.department,
      jobTitle: r.jobTitle,
      hireDate: r.hireDate,
      resignationDate: r.resignationDate,
      employmentType: r.employmentType,
      contractedWorkMinutes: r.contractedWorkMinutes,
      managerEmployeeNo: r.managerEmployeeNo,
      effectiveDate: r.effectiveDate,
    }));
  }
}
