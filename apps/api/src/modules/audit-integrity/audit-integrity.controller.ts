import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuditIntegrityVerifyService } from './audit-integrity-verify.service';
import { AuditMerkleSealService } from './audit-merkle-seal.service';

/** 무결성 검증·Merkle 봉인 상태 조회 — 운영자 온디맨드 실행용(ROADMAP STEP8 완료조건4). */
@ApiTags('audit')
@Roles('HQ_HR', 'ADMIN')
@Controller('admin/audit')
export class AuditIntegrityController {
  constructor(
    private readonly verifyService: AuditIntegrityVerifyService,
    private readonly sealService: AuditMerkleSealService,
  ) {}

  @Get('integrity-check')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  check(@Query('from') from: string, @Query('to') to: string) {
    return this.verifyService.verify(new Date(from), new Date(to));
  }

  @Get('merkle-roots')
  @ApiQuery({ name: 'from', required: true })
  @ApiQuery({ name: 'to', required: true })
  merkleRoots(@Query('from') from: string, @Query('to') to: string) {
    return this.sealService.listSealedRoots(new Date(from), new Date(to));
  }
}
