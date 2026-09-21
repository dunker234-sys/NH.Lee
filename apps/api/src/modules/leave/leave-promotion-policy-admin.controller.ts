import { Body, Controller, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { UpdateLeavePromotionPolicyDto } from './dto/update-leave-promotion-policy.dto';
import { LeavePromotionPolicyAdminService } from './leave-promotion-policy-admin.service';

@ApiTags('leave')
@Roles('ADMIN', 'HQ_HR')
@Controller('admin/leave/promotion-policy')
export class LeavePromotionPolicyAdminController {
  constructor(private readonly service: LeavePromotionPolicyAdminService) {}

  @Put()
  @ApiOperation({
    summary: '연차 사용 촉진(§61) 기한 정책 갱신 — 법정 기한보다 늦어지는 값은 저장 시점에 거부(400)',
  })
  update(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: UpdateLeavePromotionPolicyDto) {
    return this.service.update(principal, dto);
  }
}
