import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';

/** 컨테이너/로드밸런서 liveness 확인용. 인증 없이 열려 있으므로 내부 상태나
 * 버전 같은 정보는 절대 반환하지 않는다. */
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
