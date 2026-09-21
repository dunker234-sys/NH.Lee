import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HrSyncBatchStatus } from '@prisma/client';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { HrSyncApplyService } from './hr-sync-apply.service';
import { HrSyncService } from './hr-sync.service';
import { HrSyncTriggerService } from './hr-sync-trigger.service';

function todayKst(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 요구사항서 5장 인사연동 배치 관리 화면. dry-run은 즉시 동기 실행(아무것도
 * 저장하지 않는다), run은 no-show-detection과 동일하게 큐에 적재해 야간
 * 배치와 같은 코드 경로(HrSyncConsumer)를 태운다 — e2e는 DB 상태를 폴링해
 * 완료를 확인한다.
 */
@ApiTags('hr-sync')
@Roles('HQ_HR', 'ADMIN')
@Controller('admin/hr-sync')
export class HrSyncController {
  constructor(
    private readonly hrSyncService: HrSyncService,
    private readonly applyService: HrSyncApplyService,
    private readonly triggerService: HrSyncTriggerService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('dry-run')
  @ApiOperation({ summary: '인사연동 미리보기 — 아무것도 적재하지 않는다' })
  dryRun(@Body('asOfDate') asOfDate?: string) {
    return this.hrSyncService.dryRun(asOfDate ?? todayKst());
  }

  @Post('run')
  @ApiOperation({ summary: '인사연동 수동 즉시실행 — 야간 배치와 동일 큐 경로' })
  async run(@Body('asOfDate') asOfDate?: string) {
    const targetDate = asOfDate ?? todayKst();
    await this.triggerService.triggerNow(targetDate);
    return { accepted: true, asOfDate: targetDate };
  }

  @Get('batches')
  @ApiOperation({ summary: '인사연동 배치 이력' })
  async listBatches(@Query('limit') limit?: string) {
    return this.prisma.hrSyncBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit ? Number(limit) : 20,
    });
  }

  @Get('batches/:id')
  @ApiOperation({ summary: '인사연동 배치 상세(행 단위 리포트 포함)' })
  async getBatch(@Param('id') id: string) {
    return this.prisma.hrSyncBatch.findUniqueOrThrow({ where: { id }, include: { rows: true } });
  }

  @Post('batches/:id/approve')
  @ApiOperation({ summary: 'PENDING_REVIEW 배치 승인 및 반영' })
  async approve(@Param('id') id: string, @CurrentPrincipal() principal: EmployeePrincipal) {
    await this.applyService.applyBatch(id, {
      appliedBy: principal.employeeId,
      appliedByRole: principal.role,
      resultStatus: HrSyncBatchStatus.APPLIED,
    });
    return { success: true };
  }

  @Post('batches/:id/reject')
  @ApiOperation({ summary: 'PENDING_REVIEW 배치 기각' })
  async reject(@Param('id') id: string, @CurrentPrincipal() principal: EmployeePrincipal) {
    await this.applyService.rejectBatch(id, principal.employeeId);
    return { success: true };
  }
}
