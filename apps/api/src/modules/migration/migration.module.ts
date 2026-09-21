import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CutoverApprovalService } from './cutover-approval.service';
import { CutoverGuardService } from './cutover-guard.service';
import { CutoverReadinessController } from './cutover-readiness.controller';
import { MigrationExcelParseService } from './migration-excel-parse.service';
import { MigrationExcelTemplateService } from './migration-excel-template.service';
import { MigrationExcelValidateService } from './migration-excel-validate.service';
import { MigrationImportController } from './migration-import.controller';
import { MigrationImportService } from './migration-import.service';
import { SiteCutoverController } from './site-cutover.controller';
import { SiteCutoverService } from './site-cutover.service';

@Module({
  imports: [ApprovalModule, NotificationsModule],
  controllers: [MigrationImportController, SiteCutoverController, CutoverReadinessController],
  providers: [
    MigrationExcelTemplateService,
    MigrationExcelParseService,
    MigrationExcelValidateService,
    MigrationImportService,
    SiteCutoverService,
    CutoverGuardService,
    CutoverApprovalService,
  ],
  // STEP11(급여 마감) 등 이후 STEP이 "이 사업장 이관이 승인 준비됐는가"를
  // 재사용할 수 있게 CutoverGuardService를 export한다(PayrollCloseGuardService
  // export 선례와 동일 이유).
  exports: [CutoverGuardService],
})
export class MigrationModule {}
