import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { CreatePunchBulkDto } from './dto/create-punch-bulk.dto';
import { CreatePunchDto } from './dto/create-punch.dto';
import { IpAllowlistGuard } from './guards/ip-allowlist.guard';
import { PunchesService } from './punches.service';

// registrationMethod:'PC'인 요청만 실질적으로 걸러진다(가드 내부 분기) —
// GPS/NFC/QR/TABLET 요청은 이 가드를 통과하는 데 추가 비용이 거의 없다.
@UseGuards(IpAllowlistGuard)
@ApiTags('punches')
@Controller('punches')
export class PunchesController {
  constructor(private readonly punchesService: PunchesService) {}

  @Post()
  @ApiOperation({
    summary: '타각 등록 — 지오펜스/기기/QR·NFC 검증 실패에도 절대 거부하지 않는다(LOW+검토 큐로 처리)',
  })
  async create(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: CreatePunchDto) {
    const result = await this.punchesService.create(principal.employeeId, principal.employeeNo, dto);
    return {
      punchId: result.punch.id,
      duplicate: result.duplicate,
      verificationLevel: result.punch.verificationLevel,
      integrityFlags: result.punch.integrityFlags,
    };
  }

  @Post('bulk')
  @ApiOperation({ summary: '오프라인 큐 벌크 업로드 — 건별 성공/중복/실패를 배열로 응답한다' })
  async createBulk(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: CreatePunchBulkDto) {
    const results = await this.punchesService.createBulk(principal.employeeId, principal.employeeNo, dto);
    return { results };
  }
}
