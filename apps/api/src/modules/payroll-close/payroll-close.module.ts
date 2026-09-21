import { Module } from '@nestjs/common';
import { PayrollPolicyModule } from '../../common/policy/payroll-policy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PayrollCloseGuardService } from './payroll-close-guard.service';
import { PayrollCloseStageService } from './payroll-close-stage.service';
import { PayrollStatementComputationService } from './payroll-statement-computation.service';
import { PayrollCloseValidationService } from './payroll-close-validation.service';
import { EmployeeWageRateService } from './employee-wage-rate.service';
import { PayrollCloseController } from './payroll-close.controller';
import { PayrollStatementController } from './payroll-statement.controller';
import { PayrollCloseValidationController } from './payroll-close-validation.controller';
import { EmployeeWageRateController } from './employee-wage-rate.controller';
import { PAYROLL_EXPORTERS } from './payroll-export/payroll-exporter.interface';
import { ExcelPayrollExporter } from './payroll-export/excel-payroll-exporter.service';
import { CsvPayrollExporter } from './payroll-export/csv-payroll-exporter.service';
import { PayrollColumnMappingService } from './payroll-export/payroll-column-mapping.service';
import { PayrollExportService } from './payroll-export/payroll-export.service';
import { PayrollExportController } from './payroll-export/payroll-export.controller';
import { PayrollColumnMappingController } from './payroll-export/payroll-column-mapping.controller';

@Module({
  imports: [PayrollPolicyModule, NotificationsModule],
  controllers: [
    PayrollCloseController,
    PayrollStatementController,
    PayrollCloseValidationController,
    PayrollExportController,
    PayrollColumnMappingController,
    EmployeeWageRateController,
  ],
  providers: [
    PayrollCloseGuardService,
    PayrollCloseStageService,
    PayrollStatementComputationService,
    PayrollCloseValidationService,
    EmployeeWageRateService,
    ExcelPayrollExporter,
    CsvPayrollExporter,
    PayrollColumnMappingService,
    PayrollExportService,
    {
      provide: PAYROLL_EXPORTERS,
      useFactory: (excel: ExcelPayrollExporter, csv: CsvPayrollExporter) => [excel, csv],
      inject: [ExcelPayrollExporter, CsvPayrollExporter],
    },
  ],
  exports: [PayrollCloseGuardService, PayrollStatementComputationService],
})
export class PayrollCloseModule {}
