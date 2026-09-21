import { Injectable } from '@nestjs/common';
import { PunchLocation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface CreatePunchLocationInput {
  punchId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  purgeScheduledAt: Date;
}

/**
 * punch_location에 대한 애플리케이션의 유일한 접근 지점. create만 있다 —
 * 위치정보는 파기 배치(retention_job 롤)가 별도로 DELETE하며, 그 외 경로는
 * 수정하지 않는다.
 */
@Injectable()
export class PunchLocationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreatePunchLocationInput): Promise<PunchLocation> {
    return this.prisma.punchLocation.create({
      data: {
        punchId: input.punchId,
        lat: input.lat,
        lng: input.lng,
        accuracyM: input.accuracyM,
        purgeScheduledAt: input.purgeScheduledAt,
      },
    });
  }
}
