import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PunchType, RegistrationMethod } from '@prisma/client';

// class-validator @IsEnum는 Object.values(entity)로 후보를 뽑는데, 배열도
// 그대로 동작한다(배열의 Object.values는 원소 배열 자체다). Prisma가 생성하는
// 유니온 타입은 런타임 값이 없어(타입 전용) 이렇게 문자열 배열을 직접 쓴다.
const PUNCH_TYPES: readonly PunchType[] = ['IN', 'OUT', 'BREAK_OUT', 'BREAK_IN'];
const REGISTRATION_METHODS: readonly RegistrationMethod[] = ['GPS', 'NFC', 'QR', 'PC', 'TABLET'];

export class GeoLocationDto {
  @ApiProperty({ example: 37.5665 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 126.978 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiProperty({ example: 15, description: '위치 정확도(미터)' })
  @IsNumber()
  @Min(0)
  accuracyM!: number;
}

/** Android가 기기 자체에서 판단해 보낸 무결성 신호. true인 항목만 그대로 플래그로 옮긴다. */
export class AndroidIntegrityFlagsDto {
  @ApiProperty()
  @IsBoolean()
  mockLocationSuspected!: boolean;

  @ApiProperty()
  @IsBoolean()
  developerModeEnabled!: boolean;

  @ApiProperty()
  @IsBoolean()
  rootedOrJailbroken!: boolean;
}

export type ClientPlatform = 'ANDROID' | 'IOS' | 'OTHER';
export const CLIENT_PLATFORMS: ClientPlatform[] = ['ANDROID', 'IOS', 'OTHER'];

export class CreatePunchDto {
  @ApiProperty({ enum: PUNCH_TYPES })
  @IsEnum(PUNCH_TYPES)
  punchType!: PunchType;

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  @IsISO8601()
  recordedAt!: string;

  @ApiProperty({ description: '타각을 등록할 사업장' })
  @IsUUID()
  siteId!: string;

  @ApiPropertyOptional({ type: GeoLocationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoLocationDto)
  location?: GeoLocationDto;

  @ApiProperty({ enum: REGISTRATION_METHODS })
  @IsEnum(REGISTRATION_METHODS)
  registrationMethod!: RegistrationMethod;

  @ApiProperty()
  @IsString()
  deviceId!: string;

  @ApiPropertyOptional({ description: 'NFC 태그 UID 또는 QR TOTP 6자리 코드' })
  @IsOptional()
  @IsString()
  qrOrNfcToken?: string;

  @ApiPropertyOptional({ description: 'QR_WITH_AUX_CHECK 정책의 보조신호' })
  @IsOptional()
  @IsString()
  wifiBssid?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cellId?: string;

  @ApiProperty({ description: '앱 재설치에도 안정적이지 않을 수 있으므로 멱등키로 쓰지 않는다 — 추적용' })
  @IsString()
  clientEventId!: string;

  @ApiPropertyOptional({ enum: CLIENT_PLATFORMS })
  @IsOptional()
  @IsIn(CLIENT_PLATFORMS)
  platform?: ClientPlatform;

  @ApiPropertyOptional({ type: AndroidIntegrityFlagsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AndroidIntegrityFlagsDto)
  androidIntegrityFlags?: AndroidIntegrityFlagsDto;

  @ApiPropertyOptional({ description: '지오펜스 밖에서 승인된 외근/출장이 없을 때의 사유' })
  @IsOptional()
  @IsString()
  outOfGeofenceReason?: string;
}
