import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** 단건 승인/반려 공통 바디 — OvertimeRequest/DispatchRequest 둘 다 재사용한다. */
export class ApproveRejectDto {
  @ApiProperty({ description: '읽은 시점의 version — 낙관적 잠금' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ description: '반려 사유(선택)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
