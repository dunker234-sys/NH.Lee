import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsUUID } from 'class-validator';

export class MigrateFiscalYearBasisDto {
  @ApiProperty({ example: '2026-01-01', description: '이 날짜가 속한 회계연도로 소급 재계산한다' })
  @IsISO8601({ strict: true })
  asOfDate!: string;

  @ApiProperty()
  @IsUUID()
  siteId!: string;
}
