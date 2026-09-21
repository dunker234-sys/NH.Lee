import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { DeviceTokenPlatform } from '@prisma/client';

const DEVICE_TOKEN_PLATFORMS: readonly DeviceTokenPlatform[] = ['IOS', 'ANDROID', 'WEB'];

export class RegisterDeviceTokenDto {
  @ApiProperty()
  @IsString()
  deviceId!: string;

  @ApiProperty({ enum: DEVICE_TOKEN_PLATFORMS })
  @IsEnum(DEVICE_TOKEN_PLATFORMS)
  platform!: DeviceTokenPlatform;

  @ApiProperty({ description: 'FCM/APNs 등 푸시 발송에 쓸 토큰' })
  @IsString()
  token!: string;
}
