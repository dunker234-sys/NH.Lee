import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class PairKioskDeviceDto {
  @ApiProperty({ description: '관리자가 /admin/kiosk-devices로 발급받은 페어링 토큰' })
  @IsString()
  credential!: string;
}
