import { Module } from '@nestjs/common';
import { HrSyncPolicyResolverService } from './hr-sync-policy-resolver.service';

@Module({
  providers: [HrSyncPolicyResolverService],
  exports: [HrSyncPolicyResolverService],
})
export class HrSyncPolicyResolverModule {}
