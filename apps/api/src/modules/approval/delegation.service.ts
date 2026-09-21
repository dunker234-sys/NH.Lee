import { Injectable } from '@nestjs/common';
import { Delegation } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { dateOnly } from '../../common/time/week.util';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { DelegationForbiddenError, DelegationNotFoundError } from './errors/approval-errors';

@Injectable()
export class DelegationService {
  constructor(private readonly prisma: PrismaService) {}

  create(delegatorId: string, dto: CreateDelegationDto): Promise<Delegation> {
    return this.prisma.delegation.create({
      data: {
        delegatorId,
        delegateId: dto.delegateId,
        siteId: dto.siteId,
        effectiveStartDate: dateOnly(dto.effectiveStartDate),
        effectiveEndDate: dto.effectiveEndDate ? dateOnly(dto.effectiveEndDate) : undefined,
        reason: dto.reason,
      },
    });
  }

  list(employeeId: string): Promise<Delegation[]> {
    return this.prisma.delegation.findMany({
      where: { OR: [{ delegatorId: employeeId }, { delegateId: employeeId }] },
      orderBy: { effectiveStartDate: 'desc' },
    });
  }

  async revoke(employeeId: string, id: string): Promise<Delegation> {
    const row = await this.prisma.delegation.findUnique({ where: { id } });
    if (!row) throw new DelegationNotFoundError(id);
    if (row.delegatorId !== employeeId) throw new DelegationForbiddenError();
    if (row.status === 'REVOKED') return row; // idempotent

    return this.prisma.delegation.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
  }
}
