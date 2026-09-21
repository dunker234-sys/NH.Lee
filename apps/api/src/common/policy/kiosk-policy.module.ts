import { Module } from '@nestjs/common';
import { KioskPolicyResolverService } from './kiosk-policy-resolver.service';

@Module({
  providers: [KioskPolicyResolverService],
  exports: [KioskPolicyResolverService],
})
export class KioskPolicyModule {}
