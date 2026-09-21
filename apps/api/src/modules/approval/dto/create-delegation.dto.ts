import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateDelegationDto {
  @ApiProperty()
  @IsUUID()
  delegateId!: string;

  @ApiPropertyOptional({ description: '생략하면 delegator의 전체 스코프를 위임한다' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  effectiveStartDate!: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsISO8601({ strict: true })
  effectiveEndDate?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason!: string;
}
