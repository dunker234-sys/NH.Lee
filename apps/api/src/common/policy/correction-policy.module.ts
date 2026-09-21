import { Module } from '@nestjs/common';
import { CorrectionPolicyResolverService } from './correction-policy-resolver.service';

@Module({
  providers: [CorrectionPolicyResolverService],
  exports: [CorrectionPolicyResolverService],
})
export class CorrectionPolicyModule {}
