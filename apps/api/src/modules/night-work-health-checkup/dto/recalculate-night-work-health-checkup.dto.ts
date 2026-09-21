import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class RecalculateNightWorkHealthCheckupDto {
  @ApiPropertyOptional({ description: '생략하면 호출자의 org-scope 안 전 사업장' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty({ example: '2026-09-14', description: '판정 기준일(YYYY-MM-DD) — 이 날짜로부터 6개월 역산' })
  @IsDateString()
  asOfDate!: string;
}
