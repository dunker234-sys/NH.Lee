import { Module } from '@nestjs/common';
import { ApprovalPolicyModule } from '../../common/policy/approval-policy.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecalculationModule } from '../recalculation/recalculation.module';
import { ApprovalLineController } from './approval-line.controller';
import { ApprovalLineResolverService } from './approval-line-resolver.service';
import { ApprovalReportController } from './approval-report.controller';
import { ApprovalReportService } from './approval-report.service';
import { DelegationController } from './delegation.controller';
import { DelegationService } from './delegation.service';
import { DispatchApprovalController } from './dispatch-approval.controller';
import { DispatchApprovalService } from './dispatch-approval.service';
import { DispatchRequestController } from './dispatch-request.controller';
import { DispatchRequestService } from './dispatch-request.service';
import { EarlyClockInController } from './early-clockin.controller';
import { EarlyClockInPatternService } from './early-clockin-pattern.service';
import { OvertimeApprovalController } from './overtime-approval.controller';
import { OvertimeApprovalService } from './overtime-approval.service';
import { OvertimeRequestController } from './overtime-request.controller';
import { OvertimeRequestService } from './overtime-request.service';
import { WorkNotProvidedController } from './work-not-provided.controller';
import { WorkNotProvidedService } from './work-not-provided.service';

@Module({
  imports: [ApprovalPolicyModule, NotificationsModule, RecalculationModule],
  controllers: [
    OvertimeRequestController,
    OvertimeApprovalController,
    DispatchRequestController,
    DispatchApprovalController,
    WorkNotProvidedController,
    DelegationController,
    ApprovalLineController,
    EarlyClockInController,
    ApprovalReportController,
  ],
  providers: [
    OvertimeRequestService,
    OvertimeApprovalService,
    DispatchRequestService,
    DispatchApprovalService,
    WorkNotProvidedService,
    DelegationService,
    ApprovalLineResolverService,
    EarlyClockInPatternService,
    ApprovalReportService,
  ],
  // ApprovalLineResolverService는 STEP7 휴가 신청/촉진 알림 라우팅과 STEP11
  // 마감 단계 전이 알림 라우팅에 그대로 재사용한다(결재선을 다시 만들지 않는다).
  // PayrollCloseGuardService는 STEP11에서 modules/payroll-close/로 이관했다.
  exports: [ApprovalLineResolverService, ApprovalReportService],
})
export class ApprovalModule {}
