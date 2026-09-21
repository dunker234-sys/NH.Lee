import { Module } from '@nestjs/common';
import { ConsentPolicyResolverService } from './consent-policy-resolver.service';

@Module({
  providers: [ConsentPolicyResolverService],
  exports: [ConsentPolicyResolverService],
})
export class ConsentPolicyModule {}
