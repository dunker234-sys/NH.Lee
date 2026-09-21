import { Module } from '@nestjs/common';
import { PunchModule } from '../../common/punch/punch.module';
import { PunchPolicyModule } from '../../common/policy/punch-policy.module';
import { AuthModule } from '../auth/auth.module';
import { FraudDetectionModule } from '../fraud-detection/fraud-detection.module';
import { KioskDevicesModule } from '../kiosk-devices/kiosk-devices.module';
import { RecalculationModule } from '../recalculation/recalculation.module';
import { GeofenceService } from './geofence.service';
import { PunchesController } from './punches.controller';
import { PunchesService } from './punches.service';
import { QrNfcVerificationService } from './qr-nfc-verification.service';
import { QrSecretProvisioningService } from './qr-secret-provisioning.service';

@Module({
  imports: [PunchModule, PunchPolicyModule, AuthModule, RecalculationModule, FraudDetectionModule, KioskDevicesModule],
  controllers: [PunchesController],
  providers: [PunchesService, GeofenceService, QrNfcVerificationService, QrSecretProvisioningService],
  exports: [PunchesService, QrSecretProvisioningService],
})
export class PunchesModule {}
