import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

/** alert_log/location_access_log 등 self-scoped 이력 조회 공용 쿼리 — 최신순 커서 페이지네이션. */
export class CursorPageQueryDto {
  @ApiPropertyOptional({ description: '이 시각 이전 항목만 조회(커서, ISO8601)' })
  @IsOptional()
  @IsISO8601()
  before?: string;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
