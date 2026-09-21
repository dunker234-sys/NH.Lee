import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional, IsString } from 'class-validator';

export class RecordPromotionResponseDto {
  @ApiProperty({ example: '2026-08-05' })
  @IsISO8601({ strict: true })
  receivedAt!: string;

  @ApiProperty({ description: '근로자가 사용 시기를 특정해 통보했는지 여부' })
  @IsBoolean()
  specifiedUsageDates!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responseContent?: string;
}
