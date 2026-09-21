import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { decrypt, encrypt } from '../crypto/symmetric.util';
import { PrismaService } from '../prisma/prisma.service';

export interface DecryptedProtectedStatus {
  id: string;
  employeeId: string;
  statusType: string;
  effectiveStartDate: Date;
  effectiveEndDate: Date | null;
  declaredBy: string;
  declaredAt: Date;
}

export interface CreateProtectedStatusInput {
  employeeId: string;
  statusType: string;
  effectiveStartDate: Date;
  effectiveEndDate?: Date;
  declaredBy: string;
}

/**
 * employee_protected_status(임신 등 민감 보호상태)에 대한 유일한 접근
 * 지점(STEP12). statusType은 AES-256-GCM(symmetric.util.ts, qr_totp_secret과
 * 동일 패턴이지만 전용 키 PII_ENCRYPTION_KEY 사용)으로 암호화해 저장한다.
 *
 * GCM은 IV가 매번 랜덤이라 암호문 등치 비교가 불가능하다 — statusType을
 * SQL WHERE 절 조건으로 걸 수 없으므로, 이 리포지토리는 employeeId+유효기간
 * 만으로 후보 행을 가져와 전부 복호화한 뒤 반환한다. statusType 필터링은
 * 호출부가 복호화된 배열에 대해 메모리에서 수행한다(이 테이블은 보호상태
 * 선언 건수만큼만 존재하는 소규모 테이블이라 메모리 필터링 비용이 무시할
 * 만하다).
 */
@Injectable()
export class EmployeeProtectedStatusRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get key(): string {
    return this.config.get<string>('crypto.piiEncryptionKey') as string;
  }

  async create(input: CreateProtectedStatusInput): Promise<{ id: string }> {
    const created = await this.prisma.employeeProtectedStatus.create({
      data: {
        employeeId: input.employeeId,
        statusTypeEncrypted: encrypt(input.statusType, this.key),
        effectiveStartDate: input.effectiveStartDate,
        effectiveEndDate: input.effectiveEndDate,
        declaredBy: input.declaredBy,
      },
    });
    return { id: created.id };
  }

  /**
   * employeeId + 유효기간이 겹치는 후보 행을 전부 가져와 복호화해 반환한다.
   * asOfDate(특정 시점)와 periodStart/periodEnd(기간 겹침) 중 하나를 쓴다.
   */
  async findActiveDecrypted(
    employeeId: string,
    range: { asOfDate: Date } | { periodStart: Date; periodEnd: Date },
  ): Promise<DecryptedProtectedStatus[]> {
    const where: Prisma.EmployeeProtectedStatusWhereInput =
      'asOfDate' in range
        ? {
            employeeId,
            effectiveStartDate: { lte: range.asOfDate },
            OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: range.asOfDate } }],
          }
        : {
            employeeId,
            effectiveStartDate: { lte: range.periodEnd },
            OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: range.periodStart } }],
          };

    const rows = await this.prisma.employeeProtectedStatus.findMany({ where });
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      statusType: decrypt(r.statusTypeEncrypted, this.key),
      effectiveStartDate: r.effectiveStartDate,
      effectiveEndDate: r.effectiveEndDate,
      declaredBy: r.declaredBy,
      declaredAt: r.declaredAt,
    }));
  }
}
