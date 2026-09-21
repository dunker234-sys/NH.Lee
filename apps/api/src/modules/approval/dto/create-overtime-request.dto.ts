import { ApiProperty } from '@nestjs/swagger';
import { OvertimeRequestType } from '@prisma/client';
import { IsEnum, IsISO8601, IsInt, IsString, Min, MinLength } from 'class-validator';

export class CreateOvertimeRequestDto {
  @ApiProperty({ enum: ['PRE', 'POST'], description: 'PRE=사전 신청, POST=이미 발생한 미승인 실적에 대한 사후 신청' })
  @IsEnum(['PRE', 'POST'])
  requestType!: OvertimeRequestType;

  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  targetDate!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedMinutes!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;
}
