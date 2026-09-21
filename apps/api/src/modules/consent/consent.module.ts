import { Module } from '@nestjs/common';
import { ConsentPolicyModule } from '../../common/policy/consent-policy.module';
import { ConsentController } from './consent.controller';
import { ConsentRepository } from './consent.repository';
import { ConsentService } from './consent.service';
import { LocationAccessLogController } from './location-access-log.controller';
import { LocationAccessLogRepository } from './location-access-log.repository';

@Module({
  imports: [ConsentPolicyModule],
  controllers: [ConsentController, LocationAccessLogController],
  providers: [ConsentRepository, ConsentService, LocationAccessLogRepository],
})
export class ConsentModule {}
