import { Module } from '@nestjs/common';
import { PunchRawRepository } from './punch-raw.repository';
import { PunchLocationRepository } from './punch-location.repository';
import { SiteVerificationSignalRepository } from './site-verification-signal.repository';

@Module({
  providers: [PunchRawRepository, PunchLocationRepository, SiteVerificationSignalRepository],
  exports: [PunchRawRepository, PunchLocationRepository, SiteVerificationSignalRepository],
})
export class PunchModule {}
