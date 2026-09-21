import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { SystemBatchService } from './system-batch.service';

@Module({
  imports: [EmployeesModule],
  providers: [SystemBatchService],
  exports: [SystemBatchService],
})
export class SystemBatchModule {}
