import { Injectable } from '@nestjs/common';
import { DispatchRequest } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/time/week.util';
import { NotificationService } from '../notifications/notification.service';
import { ApprovalLineResolverService } from './approval-line-resolver.service';
import { CreateDispatchRequestDto } from './dto/create-dispatch-request.dto';
import { DispatchPreApprovalPastDateError } from './errors/approval-errors';

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class DispatchRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly approvalLine: ApprovalLineResolverService,
  ) {}

  async create(employeeId: string, dto: CreateDispatchRequestDto): Promise<DispatchRequest> {
    // 긴급 지원은 사전 신청이 불가능하다 — isPostHoc=false인데 과거 날짜를
    // 대상으로 하면 거부한다(요구사항서 4.6 §2 "사후 신청 경로 포함" 근거).
    if (!dto.isPostHoc && dto.startDate < todayString()) {
      throw new DispatchPreApprovalPastDateError(dto.startDate);
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { name: true, primarySiteId: true },
    });
    const originSiteId = dto.originSiteId ?? employee.primarySiteId;

    const created = await this.prisma.dispatchRequest.create({
      data: {
        employeeId,
        originSiteId,
        targetSiteId: dto.targetSiteId,
        dispatchType: dto.dispatchType,
        startDate: dateOnly(dto.startDate),
        endDate: dateOnly(dto.endDate),
        reason: dto.reason,
        isPostHoc: dto.isPostHoc,
      },
    });

    const approvers = await this.approvalLine.resolveApprovers(originSiteId, dateOnly(dto.startDate));
    for (const approver of approvers) {
      await this.notificationService.notify('DISPATCH_REQUEST_SUBMITTED', approver.employeeId, {
        employeeName: employee.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
      });
    }

    return created;
  }

  list(employeeId: string): Promise<DispatchRequest[]> {
    return this.prisma.dispatchRequest.findMany({ where: { employeeId }, orderBy: { startDate: 'desc' } });
  }
}
