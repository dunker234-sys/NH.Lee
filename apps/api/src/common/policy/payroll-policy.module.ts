import { Module } from '@nestjs/common';
import { PayrollPolicyResolverService } from './payroll-policy-resolver.service';
import { PayrollValidationPolicyResolverService } from './payroll-validation-policy-resolver.service';

@Module({
  providers: [PayrollPolicyResolverService, PayrollValidationPolicyResolverService],
  exports: [PayrollPolicyResolverService, PayrollValidationPolicyResolverService],
})
export class PayrollPolicyModule {}
