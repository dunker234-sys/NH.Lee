import { Module } from '@nestjs/common';
import { PunchPolicyResolverService } from './punch-policy-resolver.service';

@Module({
  providers: [PunchPolicyResolverService],
  exports: [PunchPolicyResolverService],
})
export class PunchPolicyModule {}
