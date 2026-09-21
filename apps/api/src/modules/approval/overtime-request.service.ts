import { Injectable } from '@nestjs/common';
import { OvertimeRequest, OvertimeRequestStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/time/week.util';
import { NotificationService } from '../notifications/notification.service';
import { ApprovalLineResolverService } from './approval-line-resolver.service';
import { CreateOvertimeRequestDto } from './dto/create-overtime-request.dto';

@Injectable()
export class OvertimeRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly approvalLine: ApprovalLineResolverService,
  ) {}

  async create(employeeId: string, dto: CreateOvertimeRequestDto): Promise<OvertimeRequest> {
    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      select: { name: true, primarySiteId: true },
    });

    const created = await this.prisma.overtimeRequest.create({
      data: {
        employeeId,
        requestType: dto.requestType,
        targetDate: dateOnly(dto.targetDate),
        expectedMinutes: dto.expectedMinutes,
        reason: dto.reason,
      },
    });

    const approvers = await this.approvalLine.resolveApprovers(employee.primarySiteId, dateOnly(dto.targetDate));
    for (const approver of approvers) {
      await this.notificationService.notify('OVERTIME_REQUEST_SUBMITTED', approver.employeeId, {
        employeeName: employee.name,
        targetDate: dto.targetDate,
      });
    }

    return created;
  }

  list(employeeId: string, status?: OvertimeRequestStatus): Promise<OvertimeRequest[]> {
    return this.prisma.overtimeRequest.findMany({
      where: { employeeId, status },
      orderBy: { targetDate: 'desc' },
    });
  }
}
