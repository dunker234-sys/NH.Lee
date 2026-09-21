import { Module } from '@nestjs/common';
import { WeeklyAlertPolicyResolverService } from './weekly-alert-policy-resolver.service';

@Module({
  providers: [WeeklyAlertPolicyResolverService],
  exports: [WeeklyAlertPolicyResolverService],
})
export class WeeklyAlertPolicyModule {}
