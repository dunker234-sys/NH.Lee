import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

export class DetectEarlyClockInDto {
  @ApiPropertyOptional({ description: '생략하면 호출자의 org-scope 안 전 사업장' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty({ example: '2026-09' })
  @Matches(/^\d{4}-\d{2}$/)
  yearMonth!: string;
}
