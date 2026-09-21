import { Module } from '@nestjs/common';
import { ConsentPolicyModule } from '../../common/policy/consent-policy.module';
import { RetentionModule } from '../retention/retention.module';
import { ConsentController } from './consent.controller';
import { ConsentRepository } from './consent.repository';
import { ConsentService } from './consent.service';
import { LocationAccessLogController } from './location-access-log.controller';

@Module({
  // STEP12: RetentionModule을 임포트해 철회(§24④) 시 지체없는 파기를
  // 트리거한다. LocationAccessLogRepository는 이제 AccessLogModule(@Global())이
  // 제공하므로 여기서 별도로 등록하지 않는다.
  imports: [ConsentPolicyModule, RetentionModule],
  controllers: [ConsentController, LocationAccessLogController],
  providers: [ConsentRepository, ConsentService],
})
export class ConsentModule {}
