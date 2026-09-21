import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OrgScope } from '../../common/scope/org-scope.types';
import { assertScope, assertSiteInScope } from '../../common/scope/scope.util';
import { CutoverGuardService } from './cutover-guard.service';

/** ★ 요구사항서4.3(STEP7.5) §4 — "사업장별 수기 집계 합계와 이관 결과의
 * 차이를 근로자 단위로 나열"하는 리포트 자체. ready===false면 admin-web의
 * 개통 승인 버튼이 비활성화된다. */
@ApiTags('migration')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/migration/cutover/readiness')
export class CutoverReadinessController {
  constructor(
    private readonly guard: CutoverGuardService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiQuery({ name: 'siteId', required: true })
  async readiness(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string) {
    assertScope(scope);
    assertSiteInScope(scope, siteId);

    const readiness = await this.guard.isReadyForApproval(siteId);
    const mismatches = await this.prisma.migrationReconciliationRecord.findMany({
      where: { siteId, diff: { not: 0 } },
      include: { employee: { select: { employeeNo: true, name: true } } },
      orderBy: [{ employee: { employeeNo: 'asc' } }, { metric: 'asc' }],
    });

    return { ...readiness, mismatches };
  }
}
