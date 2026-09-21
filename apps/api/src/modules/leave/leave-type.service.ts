import { Injectable } from '@nestjs/common';
import { LeaveType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { LeaveTypeNotFoundError } from './errors/leave-errors';

@Injectable()
export class LeaveTypeService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateLeaveTypeDto): Promise<LeaveType> {
    return this.prisma.leaveType.create({ data: dto });
  }

  list(): Promise<LeaveType[]> {
    return this.prisma.leaveType.findMany({ orderBy: { code: 'asc' } });
  }

  async update(id: string, dto: UpdateLeaveTypeDto): Promise<LeaveType> {
    const existing = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!existing) throw new LeaveTypeNotFoundError(id);
    return this.prisma.leaveType.update({ where: { id }, data: dto });
  }
}
