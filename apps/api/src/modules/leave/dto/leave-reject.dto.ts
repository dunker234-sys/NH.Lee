import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/** 승인/반려 공통 DTO와 달리 reason을 필수로 둔다 — "반려 시 사유
 * 필수"(요구사항서4.3 §3). */
export class LeaveRejectDto {
  @ApiProperty({ description: '읽은 시점의 version — 낙관적 잠금' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ description: '반려 사유(필수)' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
