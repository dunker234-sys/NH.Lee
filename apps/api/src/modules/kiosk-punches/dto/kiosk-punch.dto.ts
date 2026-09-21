import { ApiProperty } from '@nestjs/swagger';
import { PunchType } from '@prisma/client';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsISO8601, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

const PUNCH_TYPES: readonly PunchType[] = ['IN', 'OUT', 'BREAK_OUT', 'BREAK_IN'];

/**
 * 키오스크 전용 타각 요청. CreatePunchDto와 달리 siteId/deviceId가 없다 —
 * 둘 다 KioskDeviceGuard가 붙인 request.kioskDevice에서만 나온다(클라이언트가
 * 보낸 값을 신뢰하지 않는다, 스푸핑 방지). location/qrOrNfcToken도 없다
 * (TABLET 등록수단에는 해당 없음).
 */
export class KioskPunchDto {
  @ApiProperty()
  @IsString()
  employeeNo!: string;

  @ApiProperty({ description: '4~6자리 숫자' })
  @Matches(/^\d{4,6}$/)
  pin!: string;

  @ApiProperty({ enum: PUNCH_TYPES })
  @IsEnum(PUNCH_TYPES)
  punchType!: PunchType;

  @ApiProperty({ description: 'ISO 8601 timestamp — 탭한 순간 1회만 확정, 재전송 시 재계산하지 않는다' })
  @IsISO8601()
  recordedAt!: string;

  @ApiProperty()
  @IsString()
  clientEventId!: string;
}

export class KioskPunchBulkDto {
  @ApiProperty({ type: [KioskPunchDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => KioskPunchDto)
  items!: KioskPunchDto[];

  @ApiProperty({ description: '기기 시계 되감기 의심 판정에 쓰는 마지막 정상 동기화 시각' })
  @IsISO8601()
  lastKnownServerSyncTime!: string;
}
