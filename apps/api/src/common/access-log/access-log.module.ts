import { Global, Module } from '@nestjs/common';
import { AccessLogService } from './access-log.service';
import { LocationAccessLogRepository } from './location-access-log.repository';

@Global()
@Module({
  providers: [AccessLogService, LocationAccessLogRepository],
  exports: [AccessLogService, LocationAccessLogRepository],
})
export class AccessLogModule {}
