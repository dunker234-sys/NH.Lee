import { Module } from '@nestjs/common';
import { LeavePolicyModule } from '../../common/policy/leave-policy.module';
import { ApprovalModule } from '../approval/approval.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecalculationModule } from '../recalculation/recalculation.module';
import { AnnualLeaveAccrualService } from './annual-leave-accrual.service';
import { CompensatoryLeaveAdminController } from './compensatory-leave-admin.controller';
import { CompensatoryLeaveAgreementService } from './compensatory-leave-agreement.service';
import { CompensatoryLeaveService } from './compensatory-leave.service';
import { LeaveAccrualAdminController } from './leave-accrual-admin.controller';
import { LeaveBalanceAdminController } from './leave-balance-admin.controller';
import { LeaveBalanceMeController } from './leave-balance-me.controller';
import { LeaveBalanceMeService } from './leave-balance-me.service';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveDeemedAttendanceService } from './leave-deemed-attendance.service';
import { LeaveHeadcountApplicabilityService } from './leave-headcount-applicability.service';
import { LeavePromotionAdminController } from './leave-promotion-admin.controller';
import { LeavePromotionComplianceService } from './leave-promotion-compliance.service';
import { LeavePromotionPolicyAdminController } from './leave-promotion-policy-admin.controller';
import { LeavePromotionPolicyAdminService } from './leave-promotion-policy-admin.service';
import { LeavePromotionResponseService } from './leave-promotion-response.service';
import { LeavePromotionService } from './leave-promotion.service';
import { LeaveRequestApprovalController } from './leave-request-approval.controller';
import { LeaveRequestApprovalService } from './leave-request-approval.service';
import { LeaveRequestMeController } from './leave-request-me.controller';
import { LeaveRequestService } from './leave-request.service';
import { LeaveTypeAdminController } from './leave-type-admin.controller';
import { LeaveTypeService } from './leave-type.service';

@Module({
  imports: [LeavePolicyModule, NotificationsModule, RecalculationModule, ApprovalModule],
  controllers: [
    LeaveTypeAdminController,
    LeaveRequestMeController,
    LeaveRequestApprovalController,
    LeaveBalanceMeController,
    LeaveBalanceAdminController,
    LeaveAccrualAdminController,
    LeavePromotionAdminController,
    LeavePromotionPolicyAdminController,
    CompensatoryLeaveAdminController,
  ],
  providers: [
    LeaveTypeService,
    LeaveRequestService,
    LeaveRequestApprovalService,
    LeaveBalanceService,
    LeaveBalanceMeService,
    LeaveDeemedAttendanceService,
    LeaveHeadcountApplicabilityService,
    AnnualLeaveAccrualService,
    LeavePromotionService,
    LeavePromotionResponseService,
    LeavePromotionComplianceService,
    LeavePromotionPolicyAdminService,
    CompensatoryLeaveAgreementService,
    CompensatoryLeaveService,
  ],
})
export class LeaveModule {}
