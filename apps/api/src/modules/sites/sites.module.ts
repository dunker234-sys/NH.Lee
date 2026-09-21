import { Module } from '@nestjs/common';
import { SitesController } from './sites.controller';
import { SitesRepository } from './sites.repository';
import { SitesService } from './sites.service';

@Module({
  controllers: [SitesController],
  providers: [SitesRepository, SitesService],
})
export class SitesModule {}
