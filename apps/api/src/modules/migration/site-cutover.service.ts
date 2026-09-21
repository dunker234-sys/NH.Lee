import { Injectable } from '@nestjs/common';
import { SiteCutover } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { dateOnly } from '../../common/time/week.util';
import { CutoverDateNotSetError, SiteCutoverAlreadyApprovedError } from './errors/migration-errors';

@Injectable()
export class SiteCutoverService {
  constructor(private readonly prisma: PrismaService) {}

  async get(scope: OrgScope, siteId: string): Promise<SiteCutover | null> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);
    return this.prisma.siteCutover.findUnique({ where: { siteId } });
  }

  /** 이미 승인된 사업장의 기준일은 되돌려 바꿀 수 없다 — 개통 이후 이관
   * 데이터가 재해석되면 그 시점까지의 근태·급여 산출 근거가 흔들린다. */
  async setCutoverDate(scope: OrgScope, siteId: string, cutoverDate: string): Promise<SiteCutover> {
    assertScope(scope);
    assertSiteInScope(scope, siteId);

    const existing = await this.prisma.siteCutover.findUnique({ where: { siteId } });
    if (existing && existing.status === 'APPROVED') throw new SiteCutoverAlreadyApprovedError(siteId);

    return this.prisma.siteCutover.upsert({
      where: { siteId },
      create: { siteId, cutoverDate: dateOnly(cutoverDate), status: 'PENDING' },
      update: { cutoverDate: dateOnly(cutoverDate) },
    });
  }

  /** 이관 검증/커밋 전 선행 조건 확인용 — 기준일 미설정을 명확한 오류로 드러낸다. */
  async getOrThrow(siteId: string): Promise<SiteCutover> {
    const cutover = await this.prisma.siteCutover.findUnique({ where: { siteId } });
    if (!cutover) throw new CutoverDateNotSetError(siteId);
    return cutover;
  }
}
