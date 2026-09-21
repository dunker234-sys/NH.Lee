import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsISO8601, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class BulkApproveOvertimeItemDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  targetDate!: string;
}

/** 급식 현장은 건별 사전승인이 비현실적이라 미승인 실적 목록에서 다중
 * 선택 승인한다 — 버전 체크 없음(status 자체가 동시성 가드). */
export class BulkApproveOvertimeDto {
  @ApiProperty({ type: [BulkApproveOvertimeItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BulkApproveOvertimeItemDto)
  items!: BulkApproveOvertimeItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
