import { Injectable } from '@nestjs/common';
import { LocationAccessLog } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * location_access_log에 대한 이 모듈의 유일한 접근 지점. 읽기 전용 —
 * 이번 STEP은 조회 엔드포인트만 만든다. 쓰기(관리자·시스템의 위치 조회
 * 지점 계측)는 아직 이 저장소 어디에도 없다(알려진 갭, docs 참고).
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
}
