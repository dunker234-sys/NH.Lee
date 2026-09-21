import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CorrectionReasonCode } from '@prisma/client';
import { IsEnum, IsISO8601, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class SubmitCorrectionDto {
  @ApiPropertyOptional({ description: '대상 원본 타각 id(있으면 그 타각을 대체, 없으면 신규 타각으로 추가)' })
  @IsOptional()
  @IsUUID()
  targetPunchId?: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  targetWorkDate!: string;

  @ApiProperty({ enum: ['PUNCH_MISSING', 'DEVICE_ERROR', 'NETWORK_FAILURE', 'DISPATCH', 'LOCATION_ERROR', 'SCHEDULE_CHANGE', 'BREAK_NOT_GRANTED', 'OTHER'] })
  @IsEnum(['PUNCH_MISSING', 'DEVICE_ERROR', 'NETWORK_FAILURE', 'DISPATCH', 'LOCATION_ERROR', 'SCHEDULE_CHANGE', 'BREAK_NOT_GRANTED', 'OTHER'])
  reasonCode!: CorrectionReasonCode;

  @ApiProperty({ description: '사유 상세' })
  @IsString()
  @MinLength(1)
  reasonDetail!: string;

  @ApiProperty({
    description:
      'PUNCH_MISSING/DEVICE_ERROR/NETWORK_FAILURE: {punchType, recordedAt}. ' +
      'BREAK_NOT_GRANTED: {breakNotGranted: true}. 그 외: 자유 형식(계산에 반영되지 않음).',
  })
  @IsObject()
  afterValue!: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}
