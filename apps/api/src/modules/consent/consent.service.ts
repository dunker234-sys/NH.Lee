import { Injectable } from '@nestjs/common';
import { Consent, ConsentType } from '@prisma/client';
import { ConsentPolicyResolverService } from '../../common/policy/consent-policy-resolver.service';
import { ConsentRepository } from './consent.repository';

export interface ConsentStatusView {
  current: Consent | null;
  history: Consent[];
}

export interface ConsentPolicyView {
  policyVersion: string;
  retentionDays: number;
}

@Injectable()
export class ConsentService {
  constructor(
    private readonly repo: ConsentRepository,
    private readonly policyResolver: ConsentPolicyResolverService,
  ) {}

  async getPolicy(consentType: ConsentType): Promise<ConsentPolicyView> {
    // 동의는 사업장에 묶이지 않으므로 siteId=null(전사 기본값)로 조회한다.
    const policy = await this.policyResolver.resolve(null, new Date());
    return { policyVersion: policy.locationConsentPolicyVersion, retentionDays: policy.locationRetentionDays };
  }

  async getStatus(employeeId: string, consentType: ConsentType): Promise<ConsentStatusView> {
    const [current, history] = await Promise.all([
      this.repo.findLatest(employeeId, consentType),
      this.repo.findHistory(employeeId, consentType),
    ]);
    return { current, history };
  }

  /** 최초 동의(ConsentGateScreen "동의") 또는 일시중지 후 재개. */
  async agree(employeeId: string, consentType: ConsentType): Promise<Consent> {
    const policy = await this.getPolicy(consentType);
    return this.repo.recordEvent({ employeeId, consentType, status: 'AGREED', policyVersion: policy.policyVersion });
  }

  async pause(employeeId: string, consentType: ConsentType): Promise<Consent> {
    const policy = await this.getPolicy(consentType);
    return this.repo.recordEvent({ employeeId, consentType, status: 'PAUSED', policyVersion: policy.policyVersion });
  }

  /**
   * 위치정보법 §24④(철회 시 지체없는 파기)에 대한 알려진 갭: 이 메서드는
   * Consent(WITHDRAWN) 이력만 기록한다. punch_location 실제 삭제는
   * PunchLocationRepository의 자체 주석("위치정보는 파기 배치(retention_job
   * 롤)가 별도로 DELETE하며, 그 외 경로는 수정하지 않는다")이 이미 명시한
   * 경계를 존중해 이 서비스에서 직접 DELETE/UPDATE하지 않는다 — 그 배치
   * 자체가 아직 어떤 STEP에서도 구현되지 않았다(문서화된 갭, docs 참고).
   */
  async withdraw(employeeId: string, consentType: ConsentType): Promise<Consent> {
    const policy = await this.getPolicy(consentType);
    return this.repo.recordEvent({ employeeId, consentType, status: 'WITHDRAWN', policyVersion: policy.policyVersion });
  }
}
