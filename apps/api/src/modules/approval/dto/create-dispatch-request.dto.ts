import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DispatchType } from '@prisma/client';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateDispatchRequestDto {
  @ApiProperty({ enum: ['BUSINESS_TRIP', 'SITE_SUPPORT'] })
  @IsEnum(['BUSINESS_TRIP', 'SITE_SUPPORT'])
  dispatchType!: DispatchType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  originSiteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetSiteId?: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  startDate!: string;

  @ApiProperty({ example: '2026-09-03' })
  @IsISO8601({ strict: true })
  endDate!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;

  @ApiProperty({ description: '이미 발생한 외근/지원에 대한 사후 신청 여부 — false인데 startDate가 과거면 400' })
  @IsBoolean()
  isPostHoc!: boolean;
}
