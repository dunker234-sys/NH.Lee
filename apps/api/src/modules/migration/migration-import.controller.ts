import { BadRequestException, Body, Controller, Get, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentOrgScope, CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { OrgScope } from '../../common/scope/org-scope.types';
import { CommitMigrationDto } from './dto/commit-migration.dto';
import { MigrationExcelTemplateService } from './migration-excel-template.service';
import { MigrationImportService } from './migration-import.service';

@ApiTags('migration')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/migration/excel')
export class MigrationImportController {
  constructor(
    private readonly templateService: MigrationExcelTemplateService,
    private readonly importService: MigrationImportService,
  ) {}

  @Get('template')
  @ApiQuery({ name: 'siteId', required: true })
  async template(@Query('siteId') siteId: string, @Res() res: Response) {
    const buf = await this.templateService.downloadTemplate(siteId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="migration-template.xlsx"',
    });
    res.send(buf);
  }

  /** dry-run 그 자체 — 오류가 하나라도 있으면 아무것도 적재하지 않고
   * rowErrors만 반환한다(요구사항서4.3 STEP7.5 §3). */
  @Post('validate')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '파싱+행단위 검증(dry-run). 통과 시에만 commitToken 발급, 아직 적재하지 않는다.' })
  validate(@CurrentOrgScope() scope: OrgScope, @UploadedFile() file: Express.Multer.File, @Body('siteId') siteId: string) {
    if (!file) throw new BadRequestException({ code: 'MIGRATION_EXCEL_FILE_REQUIRED', message: '파일이 필요합니다.' });
    return this.importService.validate(scope, siteId, file.buffer);
  }

  @Post('commit')
  @ApiOperation({ summary: 'validate가 발급한 commitToken으로 실제 적재.' })
  commit(@CurrentOrgScope() scope: OrgScope, @CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: CommitMigrationDto) {
    return this.importService.commit(scope, principal, dto.commitToken);
  }
}
