import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AllowWhilePasswordChangeRequired } from '../../common/decorators/allow-while-password-change-required.decorator';
import { CurrentPrincipal } from '../../common/decorators/current-principal.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { EmployeePrincipal } from '../../common/principal/principal.types';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // STEP12: 계정당 잠금(MAX_FAILED_LOGIN_ATTEMPTS)과는 별개의 축 — 잠금은
  // "이 계정"을, 이 rate limit은 "이 IP"를 보호한다(분산 크리덴셜 스터핑 방어).
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '사번+비밀번호+기기ID 로그인. 미등록 기기라도 차단하지 않는다.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.employeeNo, dto.password, dto.deviceId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '리프레시 토큰 회전. 이미 폐기된 토큰 재제출 시 세션 전체를 무효화한다.' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @AllowWhilePasswordChangeRequired()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@CurrentPrincipal() principal: EmployeePrincipal, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(principal.employeeId, dto.currentPassword, dto.newPassword);
    return { success: true };
  }

  @AllowWhilePasswordChangeRequired()
  @Get('session')
  @ApiOperation({ summary: '현재 세션의 principal 확인용 (클라이언트 부트스트랩/디버그)' })
  session(@CurrentPrincipal() principal: EmployeePrincipal) {
    return { principal };
  }
}
