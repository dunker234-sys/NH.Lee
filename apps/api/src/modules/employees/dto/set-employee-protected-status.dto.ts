import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

export class SetEmployeeProtectedStatusDto {
  @ApiProperty({ description: "'PREGNANCY' 등 — 자유 문자열(확장 여지)", example: 'PREGNANCY' })
  @IsString()
  statusType!: string;

  @ApiProperty({ description: 'YYYY-MM-DD' })
  @IsISO8601({ strict: true })
  effectiveStartDate!: string;

  @ApiProperty({ description: 'YYYY-MM-DD, 미기입 시 무기한', required: false })
  @IsOptional()
  @IsISO8601({ strict: true })
  effectiveEndDate?: string;
}
