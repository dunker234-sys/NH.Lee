import { Module } from '@nestjs/common';
import { SchedulePolicyResolverService } from './schedule-policy-resolver.service';
import { SiteLaborAgreementResolverService } from './site-labor-agreement-resolver.service';

@Module({
  providers: [SchedulePolicyResolverService, SiteLaborAgreementResolverService],
  exports: [SchedulePolicyResolverService, SiteLaborAgreementResolverService],
})
export class SchedulePolicyModule {}
