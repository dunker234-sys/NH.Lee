import { Module } from '@nestjs/common';
import { KioskPolicyModule } from '../../common/policy/kiosk-policy.module';
import { KioskDevicesModule } from '../kiosk-devices/kiosk-devices.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PunchesModule } from '../punches/punches.module';
import { KioskDeviceGuard } from './guards/kiosk-device.guard';
import { KioskPunchesController } from './kiosk-punches.controller';
import { KioskPunchesService } from './kiosk-punches.service';

@Module({
  imports: [KioskDevicesModule, PunchesModule, KioskPolicyModule, NotificationsModule],
  controllers: [KioskPunchesController],
  providers: [KioskPunchesService, KioskDeviceGuard],
})
export class KioskPunchesModule {}
