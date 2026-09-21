import { Global, Module } from '@nestjs/common';
import { AccessLogService } from './access-log.service';

@Global()
@Module({
  providers: [AccessLogService],
  exports: [AccessLogService],
})
export class AccessLogModule {}
