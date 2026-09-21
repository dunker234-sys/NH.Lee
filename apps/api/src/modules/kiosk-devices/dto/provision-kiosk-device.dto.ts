import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';

export class ProvisionKioskDeviceDto {
  @ApiProperty()
  @IsUUID()
  siteId!: string;

  @ApiProperty({ description: '관리자가 보고 구분할 라벨(예: "정문 키오스크 1")' })
  @IsString()
  @Length(1, 200)
  label!: string;
}
