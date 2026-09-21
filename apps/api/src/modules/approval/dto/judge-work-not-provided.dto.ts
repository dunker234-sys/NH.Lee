import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class JudgeWorkNotProvidedDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  workDate!: string;

  @ApiProperty({ description: '필수 — 사유 없이는 저장되지 않는다' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
