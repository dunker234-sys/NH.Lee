import { Module } from '@nestjs/common';
import { LeaveAccrualBasisResolverService } from './leave-accrual-basis-resolver.service';
import { LeavePolicyResolverService } from './leave-policy-resolver.service';

@Module({
  providers: [LeavePolicyResolverService, LeaveAccrualBasisResolverService],
  exports: [LeavePolicyResolverService, LeaveAccrualBasisResolverService],
})
export class LeavePolicyModule {}
