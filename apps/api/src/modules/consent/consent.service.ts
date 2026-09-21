import { Injectable } from '@nestjs/common';
import { Consent, ConsentType } from '@prisma/client';
import { ConsentPolicyResolverService } from '../../common/policy/consent-policy-resolver.service';
import { PunchLocationRetentionTriggerService } from '../retention/punch-location-retention-trigger.service';
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
    private readonly retentionTrigger: PunchLocationRetentionTriggerService,
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
   * 위치정보법 §24④(철회 시 지체없는 파기). Consent(WITHDRAWN) 이력을 남긴
   * 뒤, 실제 punch_location 삭제는 PunchLocationRepository의 경계("위치정보는
   * 파기 배치(retention_job 롤)가 별도로 DELETE하며, 그 외 경로는 수정하지
   * 않는다")를 존중해 이 서비스가 직접 하지 않고 retention 모듈의 즉시-파기
   * 큐로 넘긴다(STEP12) — 완전 동기 삭제는 이 응답을 지연시키므로 채택하지
   * 않는다, 큐 적재 자체가 "지체없이"를 만족한다.
   */
  async withdraw(employeeId: string, consentType: ConsentType): Promise<Consent> {
    const policy = await this.getPolicy(consentType);
    const result = await this.repo.recordEvent({ employeeId, consentType, status: 'WITHDRAWN', policyVersion: policy.policyVersion });
    if (consentType === 'LOCATION_COLLECTION') {
      await this.retentionTrigger.onConsentWithdrawn(employeeId);
    }
    return result;
  }
}
