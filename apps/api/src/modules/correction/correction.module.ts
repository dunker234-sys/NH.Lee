import { Module } from '@nestjs/common';
import { CorrectionPolicyModule } from '../../common/policy/correction-policy.module';
import { ApprovalModule } from '../approval/approval.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecalculationModule } from '../recalculation/recalculation.module';
import { AdminCorrectionController } from './admin-correction.controller';
import { AdminCorrectionService } from './admin-correction.service';
import { CorrectionApprovalController } from './correction-approval.controller';
import { CorrectionApprovalService } from './correction-approval.service';
import { CorrectionReportController } from './correction-report.controller';
import { CorrectionRequestController } from './correction-request.controller';
import { CorrectionRequestService } from './correction-request.service';

@Module({
  imports: [CorrectionPolicyModule, ApprovalModule, NotificationsModule, RecalculationModule],
  controllers: [CorrectionRequestController, CorrectionApprovalController, AdminCorrectionController, CorrectionReportController],
  providers: [CorrectionRequestService, CorrectionApprovalService, AdminCorrectionService],
})
export class CorrectionModule {}
