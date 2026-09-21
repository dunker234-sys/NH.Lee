import { Injectable } from '@nestjs/common';
import { FraudSignalType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface CreateFraudSignalInput {
  punchId: string;
  employeeId: string;
  signalType: FraudSignalType;
  detail: Record<string, unknown>;
}

@Injectable()
export class PunchFraudSignalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateFraudSignalInput): Promise<void> {
    await this.prisma.punchFraudSignal.create({
      data: {
        punchId: input.punchId,
        employeeId: input.employeeId,
        signalType: input.signalType,
        detail: input.detail as Prisma.InputJsonValue,
      },
    });
  }
}
