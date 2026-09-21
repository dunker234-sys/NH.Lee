import { Injectable } from '@nestjs/common';
import { LocationAccessLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordLocationAccessInput {
  employeeId: string;
  punchLocationId?: string;
  accessedBy: string;
  accessPurpose: string;
}

/**
 * location_access_log에 대한 유일한 접근 지점(위치정보법 제16조② 확인자료).
 * AccessLogModule과 함께 전역 등록한다 — STEP5(Consent)와 STEP12(retention
 * 파기 배치) 양쪽이 순환 의존 없이 주입받아야 하기 때문이다. 이 테이블은
 * 일반 app_rw 기본 권한으로 충분해(retention_job 롤은 이 테이블에 권한이
 * 없다) 기본 PrismaService를 그대로 쓴다.
 */
@Injectable()
export class LocationAccessLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmployee(employeeId: string, before: Date | undefined, limit: number): Promise<LocationAccessLog[]> {
    return this.prisma.locationAccessLog.findMany({
      where: { employeeId, ...(before ? { accessedAt: { lt: before } } : {}) },
      orderBy: { accessedAt: 'desc' },
      take: limit,
    });
  }

  async recordMany(entries: RecordLocationAccessInput[]): Promise<void> {
    if (entries.length === 0) return;
    await this.prisma.locationAccessLog.createMany({
      data: entries.map((e) => ({
        employeeId: e.employeeId,
        punchLocationId: e.punchLocationId,
        accessedBy: e.accessedBy,
        accessPurpose: e.accessPurpose,
      })),
    });
  }
}
