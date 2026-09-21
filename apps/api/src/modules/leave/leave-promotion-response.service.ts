import { Injectable } from '@nestjs/common';
import { LeavePromotionLog } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { RecordPromotionResponseDto } from './dto/record-promotion-response.dto';
import { LeavePromotionLogNotFoundError } from './errors/leave-errors';

@Injectable()
export class LeavePromotionResponseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  async record(logId: string, dto: RecordPromotionResponseDto): Promise<LeavePromotionLog> {
    const log = await this.prisma.leavePromotionLog.findUnique({
      where: { id: logId },
      include: { leaveBalance: true },
    });
    if (!log) throw new LeavePromotionLogNotFoundError(logId);

    const updated = await this.prisma.leavePromotionLog.update({
      where: { id: logId },
      data: {
        receivedAt: new Date(`${dto.receivedAt}T00:00:00.000Z`),
        responseContent: dto.responseContent,
        requirementMet: dto.specifiedUsageDates,
      },
    });

    await this.notificationService.notify('LEAVE_PROMOTION_RESPONSE_RECORDED', log.leaveBalance.employeeId, {
      specifiedUsageDates: dto.specifiedUsageDates,
    });
    return updated;
  }
}
