import { Global, Module } from '@nestjs/common';
import { EmployeeProtectedStatusRepository } from './employee-protected-status.repository';

/**
 * EmployeesModule/ScheduleModule/LeaveModule이 순환 의존 없이 함께 주입받도록
 * AccessLogModule과 동일하게 전역 등록한다(STEP12).
 */
@Global()
@Module({
  providers: [EmployeeProtectedStatusRepository],
  exports: [EmployeeProtectedStatusRepository],
})
export class EmployeeProtectedStatusModule {}
