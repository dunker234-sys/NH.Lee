import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class RunPromotionBatchDto {
  @ApiProperty({ example: '2026-08-31' })
  @IsISO8601({ strict: true })
  asOfDate!: string;

  @ApiPropertyOptional({ description: '생략하면 호출자의 org-scope 안 전 사업장' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}
