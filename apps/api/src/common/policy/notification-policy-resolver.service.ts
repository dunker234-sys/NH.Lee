import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotificationPolicy {
  quietHoursStartMinuteOfDay: number;
  quietHoursEndMinuteOfDay: number;
}

const KEY_MAP: Record<keyof NotificationPolicy, string> = {
  quietHoursStartMinuteOfDay: 'notification_quiet_hours_start_minute_of_day',
  quietHoursEndMinuteOfDay: 'notification_quiet_hours_end_minute_of_day',
};

/**
 * 알림 조용시간 policy_config를 조립한다. 딱 2개 키뿐이지만
 * PunchPolicyResolverService가 이미 확립한 "필요한 키 전부 단일 쿼리로"
 * 형태를 처음부터 따른다 — STEP4가 겪은 N-쿼리 P95 병목을 다시 만들지
 * 않기 위해서다. common/에 두는 이유도 동일: modules/punches와
 * modules/notifications 둘 다 향후 이 정책을 읽을 수 있어야 순환
 * 의존이 생기지 않는다.
 */
@Injectable()
export class NotificationPolicyResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(siteId: string | null, asOfDate: Date): Promise<NotificationPolicy> {
    const entries = Object.entries(KEY_MAP) as [keyof NotificationPolicy, string][];
    const keys = entries.map(([, key]) => key);

    const rows = await this.prisma.policyConfig.findMany({
      where: {
        key: { in: keys },
        AND: [
          { OR: [{ siteId }, { siteId: null }] },
          { effectiveStartDate: { lte: asOfDate } },
          { OR: [{ effectiveEndDate: null }, { effectiveEndDate: { gte: asOfDate } }] },
        ],
      },
      orderBy: { effectiveStartDate: 'desc' },
    });

    const bestValueByKey = new Map<string, unknown>();
    for (const row of rows) {
      if (row.siteId === siteId && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value);
    }
    for (const row of rows) {
      if (row.siteId === null && !bestValueByKey.has(row.key)) bestValueByKey.set(row.key, row.value);
    }

    const result = {} as NotificationPolicy;
    for (const [field, key] of entries) {
      if (!bestValueByKey.has(key)) {
        throw new Error(
          `정책값 '${key}'를 policy_config에서 찾을 수 없습니다(사업장 ${siteId}, 기준일 ${asOfDate.toISOString()}). ` +
            `임의 기본값으로 대체하지 않습니다 — CLAUDE.md 절대 규칙 4.`,
        );
      }
      (result as unknown as Record<string, unknown>)[field] = bestValueByKey.get(key);
    }
    return result;
  }
}
