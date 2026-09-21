import { Module } from '@nestjs/common';
import { ApprovalPolicyResolverService } from './approval-policy-resolver.service';

@Module({
  providers: [ApprovalPolicyResolverService],
  exports: [ApprovalPolicyResolverService],
})
export class ApprovalPolicyModule {}
