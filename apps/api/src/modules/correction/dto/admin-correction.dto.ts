import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CorrectionReasonCode } from '@prisma/client';
import { IsEnum, IsISO8601, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** HQ_HR 직권 정정 — 대상 근로자를 관리자가 직접 지정한다(본인 신청이 아님). */
export class AdminCorrectionDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  targetPunchId?: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  targetWorkDate!: string;

  @ApiProperty({ enum: ['PUNCH_MISSING', 'DEVICE_ERROR', 'NETWORK_FAILURE', 'DISPATCH', 'LOCATION_ERROR', 'SCHEDULE_CHANGE', 'BREAK_NOT_GRANTED', 'OTHER'] })
  @IsEnum(['PUNCH_MISSING', 'DEVICE_ERROR', 'NETWORK_FAILURE', 'DISPATCH', 'LOCATION_ERROR', 'SCHEDULE_CHANGE', 'BREAK_NOT_GRANTED', 'OTHER'])
  reasonCode!: CorrectionReasonCode;

  @ApiProperty({ description: '직권 정정 사유 — 필수(요구사항 4.7)' })
  @IsString()
  @MinLength(1)
  reasonDetail!: string;

  @ApiProperty()
  @IsObject()
  afterValue!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}
