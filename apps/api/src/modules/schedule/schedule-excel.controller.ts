import { BadRequestException, Body, Controller, Get, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentOrgScope } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { OrgScope } from '../../common/scope/org-scope.types';
import { ScheduleExcelService } from './schedule-excel.service';

@ApiTags('schedule')
@Roles('SITE_MANAGER', 'REGIONAL', 'HQ_HR', 'ADMIN')
@Controller('admin/schedule/excel')
export class ScheduleExcelController {
  constructor(private readonly service: ScheduleExcelService) {}

  @Get('template')
  @ApiQuery({ name: 'siteId', required: true })
  async template(@CurrentOrgScope() scope: OrgScope, @Query('siteId') siteId: string, @Res() res: Response) {
    const buf = await this.service.downloadTemplate(scope, siteId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="schedule-template.xlsx"',
    });
    res.send(buf);
  }

  @Post('validate')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: '파싱+행단위 검증+그리드 버전 차분. 아직 쓰지 않는다.' })
  validate(
    @CurrentOrgScope() scope: OrgScope,
    @UploadedFile() file: Express.Multer.File,
    @Body('siteId') siteId: string,
    @Body('yearMonth') yearMonth: string,
    @Body('clientGridVersion') clientGridVersion: string,
  ) {
    if (!file) throw new BadRequestException({ code: 'EXCEL_FILE_REQUIRED', message: '파일이 필요합니다.' });
    return this.service.validate(scope, siteId, yearMonth, clientGridVersion, file.buffer);
  }

  @Post('commit')
  @ApiOperation({ summary: 'validate가 발급한 commitToken으로 실제 반영. 커밋 시점에 그리드 지문을 재검증한다.' })
  commit(@CurrentOrgScope() scope: OrgScope, @Body('commitToken') commitToken: string) {
    return this.service.commit(scope, commitToken);
  }
}
