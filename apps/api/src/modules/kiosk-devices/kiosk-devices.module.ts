import { Module } from '@nestjs/common';
import { KioskDevicesController } from './kiosk-devices.controller';
import { KioskDevicesRepository } from './kiosk-devices.repository';
import { KioskDevicesService } from './kiosk-devices.service';

@Module({
  controllers: [KioskDevicesController],
  providers: [KioskDevicesRepository, KioskDevicesService],
  exports: [KioskDevicesRepository],
})
export class KioskDevicesModule {}
