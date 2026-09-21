import { Module } from '@nestjs/common';
import { NightWorkHealthCheckupPolicyResolverService } from './night-work-health-checkup-policy-resolver.service';

@Module({
  providers: [NightWorkHealthCheckupPolicyResolverService],
  exports: [NightWorkHealthCheckupPolicyResolverService],
})
export class NightWorkHealthCheckupPolicyModule {}
